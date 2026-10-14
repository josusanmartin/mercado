"use client";
// The rate's provenance, as verified by /api/fx (relay tx must have targeted this oracle and match
// its updatedAt): e.g. "admin-relayed from Coinbase · on-chain 02:22 UTC". Falls back to the
// oracle's own honest label when the relay can't be verified.
import { useQuery } from "@tanstack/react-query";
import type { FxResponse } from "@mercado/shared";

type Fx = FxResponse & { relay?: { source: string; sourceKind?: string; fetchedAt?: string; onchainAt?: string; txHash?: string } };

export function useFxLabel() {
  const q = useQuery({
    queryKey: ["api-fx"],
    queryFn: async (): Promise<Fx> => {
      const r = await fetch("/api/fx", { cache: "no-store" });
      if (!r.ok) throw new Error(`fx ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
  });
  const fx = q.data;
  const time = fx?.relay?.onchainAt ? new Date(fx.relay.onchainAt).toISOString().slice(11, 16) + " UTC" : undefined;
  const short = fx?.relay
    ? `admin-relayed from ${fx.relay.source.split(" ")[0]}${time ? ` · on-chain ${time}` : ""}`
    : fx
      ? "admin-relayed USD/MXN (relay provenance not verified for this update)"
      : undefined;
  return { ...q, rate: fx?.rate, short, full: fx?.label, stale: fx?.stale };
}
