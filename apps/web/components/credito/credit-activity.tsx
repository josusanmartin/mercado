"use client";
// Live credit activity from chain (lib/contracts indexer: CreditPool Borrowed / Repaid / Supplied /
// Withdrawn logs). No fixtures: an empty pool shows an empty table.
import type { Address } from "viem";
import { Panel } from "@/components/console";
import { useActivityFeed } from "@/lib/contracts";
import { fmtAmount } from "@/lib/format";

export function CreditActivity({
  account,
  title,
  description,
}: {
  account?: Address;
  title: string;
  description: string;
}) {
  const feed = useActivityFeed("credit", { account, limit: 12 });
  return (
    <Panel title={title} description={description}>
      {feed.isLoading && (
        <p className="text-muted-foreground py-4 text-[15px]">
          Reading the chain…
        </p>
      )}
      {feed.isError && (
        <p className="text-destructive py-4 text-[15px]">
          Activity unavailable: the chain couldn&apos;t be read.
        </p>
      )}
      {!feed.isLoading && !feed.isError && feed.rows.length === 0 && (
        <p className="text-muted-foreground py-4 text-[15px]">
          No activity yet.
        </p>
      )}
      {feed.rows.length > 0 && (
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="py-2 pr-4 font-medium">When</th>
                <th className="py-2 pr-4 font-medium">What</th>
                <th className="py-2 pr-4 font-medium">Account</th>
                <th className="py-2 pr-4 text-right font-medium">Amount</th>
                <th className="py-2 font-medium">Tx</th>
              </tr>
            </thead>
            <tbody>
              {feed.rows.map((r) => (
                <tr key={`${r.txHash}-${r.logIndex}`} className="border-t">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {r.timestamp
                      ? new Date(r.timestamp * 1000).toLocaleString()
                      : `block ${r.blockNumber}`}
                  </td>
                  <td className="py-2 pr-4">{r.label}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{`${r.account.slice(0, 6)}…${r.account.slice(-4)}`}</td>
                  <td className="tabular py-2 pr-4 text-right">
                    {fmtAmount(r.amount)} {r.token}
                    {r.fee !== undefined && r.fee > 0n && (
                      <span className="text-muted-foreground block text-xs">
                        fee {fmtAmount(r.fee)}
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs hover:underline"
                    >
                      {r.txHash.slice(0, 10)}… ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
