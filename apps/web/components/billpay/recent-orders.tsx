"use client";
// Orders started from this browser, with their state history (CREATED → PAYMENT_VERIFIED → FULFILLED_SIMULATED).
import type { BillOrder } from "@mercado/shared";
import { Panel } from "@/components/console";
import { Button } from "@/components/ui/button";
import { fmtAmount } from "@/lib/format";
import type { RecentOrder } from "./use-bill-pay";

const STATUS_LABEL: Record<BillOrder["status"], string> = {
  CREATED: "Awaiting payment",
  PAYMENT_VERIFIED: "Paid, fulfilling",
  FULFILLED_SIMULATED: "Done (simulated)",
  FAILED: "Failed",
};

export function RecentOrders({
  orders,
  onRefresh,
  onCheck,
  checks,
}: {
  orders: RecentOrder[];
  onRefresh: () => void;
  onCheck: (o: RecentOrder) => void;
  checks: Record<string, string>;
}) {
  return (
    <Panel
      title="Recent payments"
      description="Payments started from this browser, with their full state history."
      aside={
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      }
    >
      {orders.length === 0 && (
        <p className="text-muted-foreground py-6 text-[15px]">
          No payments from this browser yet.
        </p>
      )}
      <div className="grid" data-nav="list">
        {orders.map((o) => (
          <details
            key={o.orderId}
            className="min-w-0 border-b py-3 last:border-b-0"
          >
            <summary
              data-nav-item=""
              className="flex min-h-10 min-w-0 cursor-pointer items-center justify-between gap-4"
            >
              <span className="min-w-0 truncate text-[15px]">
                {o.description.split(" (")[0]}
              </span>
              <span
                className={`shrink-0 text-[15px] font-medium ${o.status === "FAILED" ? "text-destructive" : "text-muted-foreground"}`}
              >
                {STATUS_LABEL[o.status]}
              </span>
            </summary>
            <div className="text-muted-foreground mt-2 grid gap-1 text-sm">
              <span>
                {fmtAmount(BigInt(o.amount))} xMXN · order{" "}
                <span className="font-mono">{o.orderId.slice(0, 12)}…</span>
              </span>
              {o.receipt?.explorerUrl && (
                <a
                  href={o.receipt.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground hover:underline"
                >
                  Payment tx ↗
                </a>
              )}
              {o.status === "CREATED" && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCheck(o)}
                  >
                    Check settlement
                  </Button>
                  <span>
                    Looks for this order&apos;s payment on-chain. Never pays.
                  </span>
                </div>
              )}
              {checks[o.orderId] && (
                <span className="text-foreground">{checks[o.orderId]}</span>
              )}
              {o.paidButUnfulfilled && (
                <span className="text-destructive">
                  Paid but not fulfilled: flagged for a refund.
                </span>
              )}
              {(o.unappliedPayments?.length ?? 0) > 0 && (
                <span className="text-destructive">
                  {o.unappliedPayments!.length} extra payment(s) not applied:
                  flagged for a refund.
                </span>
              )}
              <ol className="mt-1 grid gap-0.5">
                {o.history.map((h, i) => (
                  <li key={i}>
                    {new Date(h.at).toLocaleTimeString()} · {h.status}
                    {h.note ? ` · ${h.note.slice(0, 80)}` : ""}
                  </li>
                ))}
              </ol>
            </div>
          </details>
        ))}
      </div>
    </Panel>
  );
}
