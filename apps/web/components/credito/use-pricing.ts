"use client";
// Live MPP API prices from GET /api/mpp/pricing (the same values the routes charge).
import { useQuery } from "@tanstack/react-query";
import { Fetch } from "mppx/client";
import { fmtAmount } from "@/lib/format";

export type Pricing = Record<"underwriting" | "move-quote", { amount: string; symbol: string }> & {
  /** Bill pay is priced per order: the quoted bill at `perMxn` base units per MXN. */
  bills: { amount: null; perMxn: string; symbol: string };
};

export function usePricing() {
  return useQuery({
    queryKey: ["mpp-pricing"],
    staleTime: 60_000,
    // unwrapped fetch: a read must never be auto-paid by a wallet's fetch polyfill
    queryFn: async () => (await (await Fetch.unwrapFetch(globalThis.fetch)("/api/mpp/pricing")).json()) as Pricing,
  });
}

export function usePrice(product: "underwriting" | "move-quote") {
  const p = usePricing().data?.[product];
  return p ? `${fmtAmount(BigInt(p.amount))} ${p.symbol}` : undefined;
}
