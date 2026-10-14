"use client";
// Live MPP API prices from GET /api/mpp/pricing (the same values the routes charge).
import { useQuery } from "@tanstack/react-query";
import { Fetch } from "mppx/client";
import { fmtAmount } from "@/lib/format";

type Pricing = Record<
  "underwriting" | "move-quote",
  { amount: string; symbol: string }
>;

export function usePrice(product: keyof Pricing) {
  const q = useQuery({
    queryKey: ["mpp-pricing"],
    staleTime: 60_000,
    queryFn: async () =>
      (await (
        await Fetch.unwrapFetch(globalThis.fetch)("/api/mpp/pricing")
      ).json()) as Pricing,
  });
  const p = q.data?.[product];
  return p ? `${fmtAmount(BigInt(p.amount))} ${p.symbol}` : undefined;
}
