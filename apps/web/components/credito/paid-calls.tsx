"use client";
// Live table of MPP-paid API calls (GET /api/mpp/calls): each row is a real payment verified on-chain,
// recorded by the server when the paid request was served. Reusable for any paid product.
import { useQuery } from "@tanstack/react-query";
import { Fetch } from "mppx/client";
import { explorerTx } from "@mercado/shared";
import { Panel, Row, Rows } from "@/components/console";
import { Button } from "@/components/ui/button";
import { fmtAmount } from "@/lib/format";

type Calls = {
  count: number;
  totalAmount: string;
  calls: {
    txHash: string;
    payer?: string;
    amount: string;
    summary: string;
    at: string;
    protocol: string;
  }[];
};

export function PaidCalls({
  product,
  title,
  description,
}: {
  product: "underwriting" | "move-quote";
  title: string;
  description: string;
}) {
  const q = useQuery({
    queryKey: ["mpp-calls", product],
    refetchInterval: 10_000,
    // unwrapped fetch: a read must never be auto-paid by a wallet's fetch polyfill
    queryFn: async () =>
      (
        await Fetch.unwrapFetch(globalThis.fetch)(
          `/api/mpp/calls?product=${product}`,
        )
      ).json() as Promise<Calls>,
  });
  const d = q.data;
  return (
    <Panel
      title={title}
      description={description}
      aside={
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          Refresh
        </Button>
      }
    >
      <Rows>
        <Row label="Paid calls" value={d ? d.count : "…"} />
        <Row
          label="Revenue"
          value={d ? `${fmtAmount(BigInt(d.totalAmount))} xMXN` : "…"}
          sub="Settled on Tempo to the merchant"
        />
      </Rows>
      {d && d.calls.length === 0 && (
        <p className="text-muted-foreground py-4 text-[15px]">
          No paid calls yet.
        </p>
      )}
      {d && d.calls.length > 0 && (
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="py-2 pr-4 font-medium">When</th>
                <th className="py-2 pr-4 font-medium">Call</th>
                <th className="py-2 pr-4 font-medium">Payer</th>
                <th className="py-2 pr-4 text-right font-medium">Paid</th>
                <th className="py-2 font-medium">Settlement</th>
              </tr>
            </thead>
            <tbody>
              {d.calls.map((c) => (
                <tr key={c.txHash} className="border-t">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {new Date(c.at).toLocaleTimeString()}
                  </td>
                  <td className="py-2 pr-4">{c.summary}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {c.payer
                      ? `${c.payer.slice(0, 6)}…${c.payer.slice(-4)}`
                      : "—"}
                  </td>
                  <td className="tabular py-2 pr-4 text-right">
                    {fmtAmount(BigInt(c.amount))} xMXN
                  </td>
                  <td className="py-2">
                    <a
                      href={explorerTx(c.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs hover:underline"
                    >
                      {c.txHash.slice(0, 10)}… ↗
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
