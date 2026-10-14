"use client";
// Compact status for a useTx() flow: current step, explorer links per tx, readable error.
import type { useTx } from "@/lib/contracts";

export function TxStatus({ tx }: { tx: ReturnType<typeof useTx> }) {
  if (tx.status === "idle") return null;
  return (
    <div className="grid gap-1 text-sm">
      {tx.isBusy && (
        <p className="text-muted-foreground">
          {tx.stepLabel ?? "Working"}:{" "}
          {tx.status === "simulating"
            ? "checking…"
            : tx.status === "signing"
              ? "confirm in your wallet…"
              : "waiting for Tempo…"}
        </p>
      )}
      {tx.steps.map((s) => (
        <a
          key={s.hash}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline-offset-4 hover:underline"
        >
          {s.label} {s.receipt ? "✓" : "…"} · view on explorer ↗
        </a>
      ))}
      {tx.status === "error" && tx.error && (
        <p className="text-destructive">{tx.error}</p>
      )}
    </div>
  );
}
