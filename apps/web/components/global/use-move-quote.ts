"use client";
// Live MOVE quote from GET /api/move/quote (free app path). Refreshes inside the 30s expiry; the server
// prices on the active protocol's venue (v2 MoveAMM or v1 desk). Unwrapped fetch: a read never pays.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Fetch } from "mppx/client";
import type { MoveQuoteResponse, MoveSide } from "@mercado/shared";

/**
 * "1000", "1,000" and "1,000.50" are the same amount; "1,0,00" or "1.2.3" are not amounts. Returns the plain
 * decimal string, or an error a person can act on (review: a grouped amount used to sit on "Pricing…").
 */
export function normalizeAmount(raw: string): {
  clean?: string;
  error?: string;
} {
  const s = raw.trim();
  if (s === "") return {};
  const grouped = /^\d{1,3}(,\d{3})+(\.\d*)?$/.test(s);
  const clean = grouped ? s.replace(/,/g, "") : s;
  if (!/^\d+(\.\d*)?$/.test(clean))
    return { error: "Use digits with an optional dot for cents, e.g. 1000.50" };
  if ((clean.split(".")[1] ?? "").length > 6)
    return { error: "At most 6 decimals." };
  return { clean: clean.replace(/\.$/, "") };
}

export function useMoveQuote(side: MoveSide, raw: string) {
  const { clean, error: formatError } = normalizeAmount(raw);
  const amount = clean ?? "";
  const valid = !!clean && Number(clean) > 0;
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
  return { ...q, valid, formatError };
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
