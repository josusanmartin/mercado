"use client";
// Data + flow hooks for "Pay bills": quote → MPP 402 → pay with the connected wallet → verified receipt
// → SIMULATED fulfillment. Recent orders are remembered per browser (localStorage) by idempotency key.
import { useCallback, useEffect, useRef, useState } from "react";
import { useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type {
  BillOrder,
  BillPayResponse,
  BillQuoteRequest,
  BillQuoteResponse,
} from "@mercado/shared";
import {
  BillPaymentError,
  checkBillSettlement,
  getBillOrder,
  payBill,
  quoteBill,
  type PayStage,
} from "@/lib/mpp/client";

export const TELCEL_AMOUNTS = [20, 30, 50, 80, 100, 150, 200, 300, 500];

export type FlowStage = "idle" | "quoting" | "quoted" | PayStage | "error";

const STORE_KEY = "mercado.bill-orders";
type Remembered = { key: string; quoteId: string; at: string };

function loadRemembered(): Remembered[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function remember(r: Remembered) {
  try {
    const all = [r, ...loadRemembered().filter((x) => x.key !== r.key)].slice(
      0,
      10,
    );
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: history just won't persist */
  }
}

export function useBillPay() {
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<FlowStage>("idle");
  const [quote, setQuote] = useState<BillQuoteResponse>();
  const [result, setResult] = useState<BillPayResponse>();
  const [error, setError] = useState<string>();
  const [errorCode, setErrorCode] = useState<string>();
  // One idempotency key per quote, reused on every retry so retries resolve the same order instead of opening a new payment.
  const keyRef = useRef<string | undefined>(undefined);

  const requestQuote = useCallback(async (req: BillQuoteRequest) => {
    setStage("quoting");
    setError(undefined);
    setErrorCode(undefined);
    setResult(undefined);
    try {
      const q = await quoteBill(req);
      keyRef.current = crypto.randomUUID();
      setQuote(q);
      setStage("quoted");
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    }
  }, []);

  const pay = useCallback(async () => {
    if (!quote || !walletClient) return;
    const idempotencyKey = (keyRef.current ??= crypto.randomUUID());
    remember({
      key: idempotencyKey,
      quoteId: quote.quoteId,
      at: new Date().toISOString(),
    });
    setError(undefined);
    setErrorCode(undefined);
    try {
      const r = await payBill({
        quoteId: quote.quoteId,
        idempotencyKey,
        walletClient,
        onStage: setStage,
      });
      setResult(r.order);
      setStage("done");
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(
        e instanceof BillPaymentError ? e.message : readableWalletError(e),
      );
      setErrorCode(e instanceof BillPaymentError ? e.code : undefined);
      setStage("error");
    }
  }, [quote, walletClient, queryClient]);

  const reset = useCallback(() => {
    setStage("idle");
    setQuote(undefined);
    setResult(undefined);
    setError(undefined);
    setErrorCode(undefined);
    keyRef.current = undefined;
  }, []);

  return {
    stage,
    quote,
    result,
    error,
    errorCode,
    requestQuote,
    pay,
    reset,
    canPay: !!walletClient && !!quote,
  };
}

function readableWalletError(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  if (/user rejected|denied/i.test(msg))
    return "You cancelled the payment in your wallet. Nothing was charged.";
  if (/insufficient|exceeds balance/i.test(msg))
    return "Not enough xMXN for this payment (draw an advance first).";
  return msg.split("\n")[0];
}

export type RecentOrder = BillOrder & {
  quoteId: string;
  idempotencyKey: string;
};

/** Orders this browser started, freshest first. */
export function useRecentOrders() {
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const refresh = useCallback(async () => {
    const found = await Promise.all(
      loadRemembered().map((r) =>
        getBillOrder(r.key)
          .then((o): RecentOrder => ({
            ...o,
            quoteId: r.quoteId,
            idempotencyKey: r.key,
          }))
          .catch(() => undefined),
      ),
    );
    setOrders(found.filter((o): o is RecentOrder => !!o));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** R-018: same-key, credential-less recheck that lets the server reconcile from chain. Never pays. */
  const [checks, setChecks] = useState<Record<string, string>>({});
  const check = useCallback(
    async (o: RecentOrder) => {
      setChecks((c) => ({ ...c, [o.orderId]: "Checking the chain…" }));
      try {
        const r = await checkBillSettlement(o.quoteId, o.idempotencyKey);
        const msg =
          r.state === "settled"
            ? "Payment found and applied."
            : r.state === "unpaid"
              ? "No payment found on-chain for this order. Nothing was charged."
              : r.message;
        setChecks((c) => ({ ...c, [o.orderId]: msg }));
      } catch (e) {
        setChecks((c) => ({ ...c, [o.orderId]: (e as Error).message }));
      }
      await refresh();
    },
    [refresh],
  );
  return { orders, refresh, check, checks };
}
