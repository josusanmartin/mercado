"use client";
// Live MOVE quote from GET /api/move/quote (free app path). Refreshes inside the 30s expiry; the server
// prices on the active protocol's venue (v2 MoveAMM or v1 desk). Unwrapped fetch: a read never pays.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Fetch } from "mppx/client";
import type { MoveQuoteResponse, MoveSide } from "@mercado/shared";

export function useMoveQuote(side: MoveSide, amount: string) {
  const valid = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0;
  const q = useQuery({
    queryKey: ["move-quote", side, amount],
    enabled: valid,
    refetchInterval: 15_000,
    retry: false,
    queryFn: async () => {
      const res = await Fetch.unwrapFetch(globalThis.fetch)(
        `/api/move/quote?side=${side}&amount=${amount}`,
      );
      const body = await res.json();
      if (!res.ok)
        throw new Error(body?.error ?? `Quote failed (${res.status})`);
      return body as MoveQuoteResponse;
    },
  });
  return { ...q, valid };
}

/** Seconds left until `expiresAt` (unix s); the clock is only read in effects. */
export function useSecondsLeft(expiresAt: number | undefined) {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return expiresAt && now !== undefined
    ? Math.max(0, expiresAt - now)
    : undefined;
}
