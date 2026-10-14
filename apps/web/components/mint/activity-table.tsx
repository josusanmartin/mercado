"use client";
// Live on-chain activity table (getLogs via useActivityFeed). Every row links to its transaction.
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useConnection } from "wagmi";
import { Panel } from "@/components/console";
import { useActivityFeed, type ActivityKind, type ActivityRow } from "@/lib/contracts";
import { fmtAmount, shortAddr, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

export function ActivityTable({
  kind,
  title,
  description,
  render,
  limit = 15,
}: {
  kind: ActivityKind;
  title: string;
  description?: string;
  /** Optional custom "amount" cell. */
  render?: (r: ActivityRow) => React.ReactNode;
  limit?: number;
}) {
  const { address } = useConnection();
  const [mine, setMine] = useState(false);
  const feed = useActivityFeed(kind, { account: mine ? address : undefined, limit });
  const now = useNow(15_000);
  return (
    <Panel
      title={title}
      description={description ?? "Read from on-chain event logs; every row links to its transaction."}
      aside={
        address && (
          <div data-nav="row" className="flex gap-1 rounded-full border p-0.5 text-sm">
            {[false, true].map((m) => (
              <button
                key={String(m)}
                type="button"
                data-nav-item=""
                onClick={() => setMine(m)}
                className={cn("mx-press rounded-full px-3 py-1", mine === m ? "bg-foreground text-background" : "text-muted-foreground")}
              >
                {m ? "Mine" : "All"}
              </button>
            ))}
          </div>
        )
      }
    >
      {feed.isLoading ? (
        <p className="text-muted-foreground py-6 text-sm">Reading event logs…</p>
      ) : feed.error ? (
        <p className="text-destructive py-6 text-sm">Couldn&apos;t read activity right now.</p>
      ) : feed.rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-sm">No activity yet{mine ? " for this wallet" : ""}.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-1 py-2 font-medium">What</th>
                <th className="px-1 py-2 text-right font-medium">Amount</th>
                <th className="px-1 py-2 font-medium">Account</th>
                <th className="px-1 py-2 font-medium">When</th>
                <th className="px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {feed.rows.map((r) => (
                <tr key={`${r.txHash}-${r.logIndex}`} className="hover:bg-[color-mix(in_oklab,var(--accent)_9%,transparent)] border-t transition-colors">
                  <td className="px-1 py-2.5">{r.label}</td>
                  <td className="px-1 py-2.5 text-right tabular">
                    {render ? render(r) : `${fmtAmount(r.amount)} ${r.token}`}
                  </td>
                  <td className="px-1 py-2.5 font-mono text-xs">{shortAddr(r.account)}</td>
                  <td className="text-muted-foreground px-1 py-2.5 text-xs">{r.timestamp && now ? timeAgo(r.timestamp, now) : "…"}</td>
                  <td className="px-1 py-2.5 text-right">
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs hover:underline">
                      tx <ExternalLink className="size-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {feed.total > feed.rows.length && <p className="text-muted-foreground pt-2 text-xs">Showing {feed.rows.length} of {feed.total}.</p>}
        </div>
      )}
    </Panel>
  );
}
