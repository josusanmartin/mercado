"use client";
// Principle 5, "small meta, big statement": tiny uppercase lines carrying live context and the honesty
// labels, e.g. "CDMX · 18.37 MXN/USD · 02:58 · TESTNET · NO REAL VALUE".
import type { ReactNode } from "react";
import { useOracle } from "@/lib/contracts";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("meta text-muted-foreground", className)}>{children}</p>;
}

/** CDMX time, the on-chain USD/MXN rate and the testnet labels, live. */
export function LiveMeta({ prefix, className }: { prefix?: ReactNode; className?: string }) {
  const fx = useOracle();
  const now = useNow(30_000);
  const time = now ? new Date(now * 1000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" }) : "--:--";
  return (
    <Meta className={className}>
      {prefix && <>{prefix} · </>}CDMX · {fx.rate === undefined ? "—" : fx.rate.toFixed(2)} MXN/USD · {time} · Testnet · No real value
    </Meta>
  );
}
