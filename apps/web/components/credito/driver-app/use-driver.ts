"use client";
// Driver-app data: demo work-platform earnings → illustrative score + signed, expiring attestation →
// real borrow/repay on the CreditPool (protocol-aware via lib/contracts). Platform is passed through
// to api's routes; the UI always shows the label the API returns (never our own data name).
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { explorerTx, type DriverDemoResponse, type DriverScoreResponse } from "@mercado/shared";
import { useBorrowCapacity, useMercado, usePool } from "@/lib/contracts";
import { useReportBusy } from "@/lib/busy";

export type Platform = "uber" | "didi" | "rappi";

export const PLATFORMS: { id: Platform; name: string; kind: string }[] = [
  { id: "uber", name: "Uber", kind: "Viajes · rides" },
  { id: "didi", name: "DiDi", kind: "Viajes · rides" },
  { id: "rappi", name: "Rappi", kind: "Entregas · deliveries" },
];

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function useDriverData(platform: Platform | undefined) {
  return useQuery({
    queryKey: ["driver-demo", platform],
    enabled: !!platform,
    staleTime: Infinity,
    queryFn: () =>
      fetch(`/api/driver/demo?profile=steady&platform=${platform}`).then((r) =>
        json<DriverDemoResponse & { platform?: string }>(r),
      ),
  });
}

export function useScore() {
  return useMutation({
    mutationFn: ({
      borrower,
      platform,
    }: {
      borrower: Address;
      platform: Platform;
    }) =>
      fetch("/api/driver/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrower, profile: "steady", platform }),
      }).then((r) => json<DriverScoreResponse & { platform?: string }>(r)),
  });
}

/** Seconds until `expiry`; clock read in effects only. */
export function useCountdown(expiry: number | undefined) {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    if (!expiry) return;
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiry]);
  return expiry && now !== undefined ? Math.max(0, expiry - now) : undefined;
}

export function useAdvance(
  borrower: Address | undefined,
  platform: Platform | undefined,
) {
  const score = useScore();
  const pool = usePool();
  const m = useMercado();
  useReportBusy(m.tx.isBusy);
  const s = score.data;
  // Only use an attestation that was issued for THIS wallet (R-014).
  const att =
    s?.attestation &&
    borrower &&
    s.attestation.borrower.toLowerCase() === borrower.toLowerCase()
      ? s.attestation
      : undefined;
  const capacity = useBorrowCapacity(att ? BigInt(att.maxAmount) : undefined);
  const secondsLeft = useCountdown(att?.expiry);
  const expired = secondsLeft === 0;

  const check = useCallback(() => {
    if (borrower && platform) score.mutate({ borrower, platform });
  }, [borrower, platform, score]);

  const draw = useCallback(
    async (amount: bigint) => {
      if (!att) return undefined;
      const steps = await m.borrow(amount, {
        ...att,
        dataHash: att.dataHash as Hex,
        signature: att.signature as Hex,
      });
      // The nonce is consumed: fetch a fresh offer for any further draw (R-014).
      if (steps) check();
      return steps;
    },
    [att, m, check],
  );

  return {
    score,
    att,
    expired,
    secondsLeft,
    available:
      (capacity.data as bigint | undefined) ??
      (s ? BigInt(s.availableToBorrow) : undefined),
    pool,
    tx: m.tx,
    check,
    draw,
    repay: (amount: bigint) => m.repayLoan(amount),
  };
}

export type CreditEvent = {
  event: "Borrowed" | "Repaid";
  amount: bigint;
  fee?: bigint;
  txHash: Hex;
  logIndex: number;
  url: string;
  timestamp?: number;
};

/** This borrower's Borrowed/Repaid events from the server-side index (GET /api/credit/history), so the
 *  browser never runs eth_getLogs (CR-08). react-query keeps the last good rows if a refresh fails. */
export function useCreditHistory(borrower: Address | undefined) {
  return useQuery({
    queryKey: ["credit-history", borrower],
    enabled: !!borrower,
    refetchInterval: 15_000,
    queryFn: async () => {
      const body = await fetch(`/api/credit/history?address=${borrower}`).then((r) =>
        json<{ rows: { kind: "borrow" | "repay"; amount: string; fee?: string; txHash: Hex; logIndex: number; timestamp?: number }[] }>(r),
      );
      return body.rows.map(
        (r): CreditEvent => ({
          event: r.kind === "borrow" ? "Borrowed" : "Repaid",
          amount: BigInt(r.amount),
          fee: r.fee !== undefined ? BigInt(r.fee) : undefined,
          txHash: r.txHash,
          logIndex: r.logIndex,
          url: explorerTx(r.txHash),
          timestamp: r.timestamp,
        }),
      );
    },
  });
}
