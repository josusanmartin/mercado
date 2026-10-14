"use client";
// Status for a useMercado()/useTx() flow: the step in flight, one explorer link per confirmed tx, and
// a readable revert reason. Also records confirmed txs for Home and reports "busy" app-wide.
import { useEffect } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Loader2 } from "lucide-react";
import { useConnection } from "wagmi";
import type { useTx } from "@/lib/contracts";
import { recordActivity } from "@/lib/activity";
import { useReportBusy } from "@/lib/busy";
import { cn } from "@/lib/utils";

type Tx = ReturnType<typeof useTx>;

const PHASE: Record<string, string> = {
  simulating: "Checking it will succeed",
  signing: "Confirm in your wallet",
  pending: "Waiting for Tempo to confirm",
};

export function TxProgress({ tx, className, successNote }: { tx: Tx; className?: string; successNote?: string }) {
  const { address } = useConnection();
  useReportBusy(tx.isBusy);

  useEffect(() => {
    for (const s of tx.steps)
      if (s.receipt && address) recordActivity({ hash: s.hash, label: s.label, account: address, at: Date.now(), url: s.url });
  }, [tx.steps, address]);

  if (tx.status === "idle") return null;
  return (
    <div aria-live="polite" className={cn("grid gap-2 rounded-lg border bg-background/60 p-3 text-sm", className)}>
      {tx.steps.map((s) => (
        <a
          key={s.hash}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-2 rounded-md"
        >
          {s.receipt ? <CheckCircle2 className="text-success size-4 shrink-0" /> : <Loader2 className="size-4 shrink-0 animate-spin" />}
          <span className="font-medium">{s.label}</span>
          <span className="text-muted-foreground truncate tabular">{s.hash.slice(0, 10)}…</span>
          <span className="text-primary ml-auto inline-flex shrink-0 items-center gap-1 text-xs group-hover:underline">
            Explorer <ExternalLink className="size-3" />
          </span>
        </a>
      ))}
      {tx.isBusy && (
        <p className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {tx.stepLabel ? `${tx.stepLabel}: ` : ""}
          {PHASE[tx.status] ?? "Working"}…
        </p>
      )}
      {tx.status === "success" && successNote && <p className="text-success font-medium">{successNote}</p>}
      {tx.status === "error" && tx.error && (
        <p className="text-destructive flex items-start gap-2">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {tx.error}
        </p>
      )}
    </div>
  );
}
