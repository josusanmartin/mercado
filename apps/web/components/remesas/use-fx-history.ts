"use client";
// Real USD/MXN observations for the home sparkline: the on-chain feed's PriceUpdated logs, keeping only
// the relay keeper's setPrice() pushes (admin forceSet() stress overrides are not market observations).
// No decorative data: with fewer than 3 relay points the sparkline is simply not shown.
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem, toFunctionSelector, type Hex } from "viem";
import { ADDR, CHAIN_ID } from "@/lib/contracts";

const PRICE_UPDATED = parseAbiItem(
  "event PriceUpdated(uint256 mxnPerUsd, uint256 updatedAt)",
);
const SET_PRICE = toFunctionSelector("setPrice(uint256)");
const WINDOW = 150_000n; // ≈ the last day of Moderato blocks
const STEP = 50_000n;
const MAX_POINTS = 16;

export type FxPoint = { rate: number; at: number };

export function useFxHistory() {
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["fx-relay-history", ADDR.oracle],
    enabled: !!client && !!ADDR.oracle,
    staleTime: 300_000,
    refetchInterval: 300_000,
    retry: 1,
    queryFn: async (): Promise<FxPoint[]> => {
      const head = await client!.getBlockNumber();
      const logs = [];
      for (
        let to = head;
        to > head - WINDOW && logs.length < MAX_POINTS * 3;
        to -= STEP
      ) {
        const from = to - STEP + 1n;
        logs.unshift(
          ...(await client!.getLogs({
            address: ADDR.oracle,
            event: PRICE_UPDATED,
            fromBlock: from,
            toBlock: to,
          })),
        );
      }
      // Newest first, a few at a time (the public RPC rate-limits bursts), stop once we have enough.
      const recent = logs.slice(-MAX_POINTS * 2).reverse();
      const checked: (FxPoint | undefined)[] = [];
      for (
        let i = 0;
        i < recent.length && checked.filter(Boolean).length < MAX_POINTS;
        i += 4
      ) {
        checked.push(
          ...(await Promise.all(
            recent.slice(i, i + 4).map(async (l) => {
              const tx = (await client!.getTransaction({
                hash: l.transactionHash,
              })) as { input?: Hex; calls?: { input?: Hex; data?: Hex }[] };
              const inputs = [
                tx.input,
                ...(tx.calls ?? []).map((c) => c.input ?? c.data),
              ].filter(Boolean) as Hex[];
              const relay = inputs.some(
                (i) => i.slice(0, 10).toLowerCase() === SET_PRICE,
              );
              return relay
                ? {
                    rate: Number(l.args.mxnPerUsd) / 1e8,
                    at: Number(l.args.updatedAt),
                  }
                : undefined;
            }),
          )),
        );
      }
      return checked
        .filter((p): p is FxPoint => !!p)
        .reverse()
        .slice(-MAX_POINTS);
    },
  });
}
