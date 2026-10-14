"use client";
// Orders started from this browser, with their state history (CREATED → PAYMENT_VERIFIED → FULFILLED_SIMULATED).
import type { BillOrder } from "@mercado/shared";
import type { RecentOrder } from "./use-bill-pay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtAmount } from "@/lib/format";

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent payments</CardTitle>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        {orders.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No payments from this browser yet.
          </p>
        )}
        {orders.map((o) => (
          <details
            key={o.orderId}
            className="min-w-0 overflow-hidden rounded-lg border p-2 text-sm"
          >
            <summary className="flex min-w-0 cursor-pointer justify-between gap-2">
              <span className="min-w-0 truncate">
                {o.description.split(" (")[0]}
              </span>
              <span
                className={`shrink-0 ${o.status === "FAILED" ? "text-destructive" : "text-muted-foreground"}`}
              >
                {STATUS_LABEL[o.status]}
              </span>
            </summary>
            <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
              <span>
                {fmtAmount(BigInt(o.amount))} · order {o.orderId.slice(0, 12)}…
              </span>
              {o.receipt?.explorerUrl && (
                <a
                  href={o.receipt.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  payment tx ↗
                </a>
              )}
              {o.status === "CREATED" && (
                <div className="flex flex-wrap items-center gap-2">
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
                  Paid but unfulfilled: flagged for refund.
                </span>
              )}
              {(o.unappliedPayments?.length ?? 0) > 0 && (
                <span className="text-destructive">
                  {o.unappliedPayments!.length} extra payment(s) not applied:
                  flagged for refund.
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
      </CardContent>
    </Card>
  );
}
