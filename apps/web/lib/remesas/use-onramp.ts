"use client";
// "Agregar dólares": (a) simulated card checkout whose OUSD delivery is a REAL on-chain transfer from the
// on-ramp float (POST /api/onramp, 4242 test card only, capped); (b) the REAL Tempo Wallet funding flow
// via wallet_deposit for Tempo Wallet users (faucet on testnet, card/Apple Pay on mainnet).
import { useCallback, useState } from "react";
import { useConnection } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TEMPO_ADDRESSES, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { useReportBusy } from "@/lib/busy";

export type OnrampStage = "idle" | "charging" | "delivering" | "done" | "error";
export type OnrampResult = { status: "delivered" | "pending"; txHash: `0x${string}`; explorerUrl: string; amount: string; simulatedCharge: { last4: string; label: string } };

// The in-flight top-up's key is persisted so a reload resumes the SAME delivery (never a second one).
const PENDING_KEY = "mercado.onramp.pending";
type PendingTopup = { key: string; address: string; amountUsd: number };
const loadPending = (): PendingTopup | undefined => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
};
const savePending = (p?: PendingTopup) => {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
};

export const ONRAMP_TEST_CARD = { number: "4242 4242 4242 4242", exp: "12/34", cvc: "123" };
export const ONRAMP_LABEL = "Simulated card payment: no card is charged. Tempo Wallet's card on-ramp is mainnet-only. The dollars you receive are a real testnet OUSD transfer.";
export const ONRAMP_MAX_PER_TX = 500;

export function useOnramp() {
  const { address, connector } = useConnection();
  const qc = useQueryClient();
  const [stage, setStage] = useState<OnrampStage>("idle");
  // Server flag: off until review accepts the on-ramp (lead). The Tempo Wallet path stays available.
  const status = useQuery({
    queryKey: ["onramp-status"],
    queryFn: async () => (await fetch("/api/onramp", { cache: "no-store" })).json() as Promise<{ enabled: boolean; minUsd: number; maxPerTxUsd: number }>,
    staleTime: 30_000,
  });
  const [result, setResult] = useState<OnrampResult>();
  const [error, setError] = useState<string>();
  useReportBusy(stage === "charging" || stage === "delivering");

  const buyWithCard = useCallback(
    async (amountUsd: number, card = ONRAMP_TEST_CARD) => {
      if (!address) return;
      setError(undefined);
      setResult(undefined);
      setStage("charging");
      // Resume an unfinished top-up for this wallet with its original key and amount; else start one.
      const resume = loadPending();
      const p: PendingTopup =
        resume && resume.address.toLowerCase() === address.toLowerCase() ? resume : { key: crypto.randomUUID(), address, amountUsd };
      savePending(p);
      // The card step is simulated (no processor); give it a visible beat, then the real transfer runs.
      const t = setTimeout(() => setStage("delivering"), 900);
      try {
        for (let attempt = 0; attempt < 6; attempt++) {
          const res = await fetch("/api/onramp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: p.address, amountUsd: p.amountUsd, card, idempotencyKey: p.key }),
          });
          const body = await res.json();
          if (res.status === 202) {
            setStage("delivering");
            await new Promise((r) => setTimeout(r, 4_000)); // settlement unknown yet: ask again, same key
            continue;
          }
          if (!res.ok) {
            // A definitive failure (or a rejected request) ends this top-up; nothing was delivered.
            if (res.status !== 503) savePending(undefined);
            throw new Error(body.error ?? `Top-up failed (${res.status})`);
          }
          savePending(undefined);
          setResult(body);
          setStage("done");
          await qc.invalidateQueries();
          return body as OnrampResult;
        }
        throw new Error("Still confirming on Tempo. Your top-up is safe; open this again to check, and it won't be sent twice.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStage("error");
      } finally {
        clearTimeout(t);
      }
    },
    [address, qc],
  );

  /** Real Tempo Wallet funding UI (only for Tempo Wallet / passkey connections). */
  const canTempoDeposit = connector?.type === "tempoWallet" || connector?.type === "webAuthn";
  const tempoDeposit = useCallback(
    async (amountUsd?: number) => {
      if (!connector || !address) return;
      const provider = (await connector.getProvider()) as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
      await provider.request({
        method: "wallet_deposit",
        params: [{ address, chainId: TEMPO_MODERATO_CHAIN_ID, token: TEMPO_ADDRESSES.ousd, ...(amountUsd ? { amount: String(amountUsd) } : {}) }],
      });
      // A resolved request doesn't prove funding (Tempo docs); balances refresh from chain.
      await qc.invalidateQueries();
    },
    [connector, address, qc],
  );

  return { stage, result, error, enabled: status.data?.enabled ?? false, buyWithCard, canTempoDeposit, tempoDeposit, reset: () => (setStage("idle"), setResult(undefined), setError(undefined)) };
}
