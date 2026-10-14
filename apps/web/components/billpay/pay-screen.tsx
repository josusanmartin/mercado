"use client";
// "Pay bills": quote a mock Telcel top-up (or CFE bill) → pay through a real MPP HTTP 402 flow with the
// connected wallet → on-chain receipt next to the SIMULATED fulfillment and your remaining advance.
import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import type { BillProviderId } from "@mercado/shared";
import { explorerAddress } from "@mercado/shared";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBalances, usePool } from "@/lib/contracts";
import { fmtAmount } from "@/lib/format";
import { PayStepper } from "./pay-stepper";
import { RecentOrders } from "./recent-orders";
import { TELCEL_AMOUNTS, useBillPay, useRecentOrders } from "./use-bill-pay";

export function PayScreen() {
  const { address } = useConnection();
  const flow = useBillPay();
  const recent = useRecentOrders();
  const balances = useBalances();
  const pool = usePool();

  const [provider, setProvider] = useState<BillProviderId>("telcel");
  const [phone, setPhone] = useState("5512345678");
  const [serviceNumber, setServiceNumber] = useState("123456789012");
  const [amount, setAmount] = useState(100);

  const q = flow.quote;
  const busy = [
    "quoting",
    "requesting",
    "challenge",
    "signing",
    "verifying",
  ].includes(flow.stage);
  const insufficient =
    q && balances.xmxn !== undefined && balances.xmxn < BigInt(q.amount);
  const r = flow.result;
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (r)
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [r]);

  // R-015: the quote (and its idempotency key) is for one destination and amount. Any edit drops it, and
  // the form is locked while a payment is in flight.
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      if (busy) return;
      set(v);
      if (flow.quote) flow.reset();
    };
  const editPhone = edit(setPhone);
  const editService = edit(setServiceNumber);
  const editAmount = edit(setAmount);

  const getQuote = () =>
    flow.requestQuote(
      provider === "telcel"
        ? { provider, phone, amountMxn: amount }
        : { provider, serviceNumber, amountMxn: amount },
    );
  const pay = async () => {
    await flow.pay();
    void recent.refresh();
  };

  return (
    <div>
      <PageHeader
        title="Pay bills"
        lede="Pay with xMXN through a real HTTP 402 payment (MPP) on Tempo. The top-up itself is simulated."
        aside={
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">Payment: real testnet transfer</Badge>
            <Badge variant="mock">Fulfillment: SIMULATED</Badge>
          </div>
        }
      />
      {r && (
        <section ref={resultRef} className="mb-6 grid gap-3" aria-live="polite">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Payment <Badge variant="success">on-chain</Badge>
                </CardTitle>
                <CardDescription>
                  Verified by the server before anything was fulfilled.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <Line
                  label="Amount"
                  value={`${fmtAmount(BigInt(r.receipt.amount))} ${q?.tokenSymbol ?? "xMXN"}`}
                  strong
                />
                {r.receipt.payer && (
                  <Line label="From" value={short(r.receipt.payer)} />
                )}
                <Line label="To" value={short(r.receipt.recipient)} />
                <a
                  href={r.receipt.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 text-primary underline-offset-4 hover:underline"
                >
                  Tx {short(r.receipt.txHash)} ↗
                </a>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Top-up <Badge variant="mock">SIMULATED</Badge>
                </CardTitle>
                <CardDescription>
                  {r.fulfillment?.label ??
                    "SIMULATED fulfillment, no real top-up"}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {r.status === "FULFILLED_SIMULATED" && r.fulfillment ? (
                  <>
                    <Line
                      label="Reference"
                      value={r.fulfillment.reference}
                      strong
                    />
                    <Line label="Provider" value={r.fulfillment.providerName} />
                  </>
                ) : (
                  <p className="text-destructive">
                    {r.paidButUnfulfilled
                      ? "Paid but not fulfilled: the (simulated) provider rejected it. Your payment is recorded and flagged for a refund."
                      : `Status: ${r.status}`}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Your advance <Badge variant="outline">on-chain</Badge>
                </CardTitle>
                <CardDescription>
                  Still owed to the credit pool. Repayment is manual.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <Line
                  label="Advance outstanding"
                  value={`${fmtAmount(pool.debt)} xMXN`}
                  strong
                />
                <Line
                  label="xMXN left"
                  value={`${fmtAmount(balances.xmxn)} xMXN`}
                />
              </CardContent>
            </Card>
          </div>
          <Button variant="outline" className="w-fit" onClick={flow.reset}>
            Pay another bill
          </Button>
        </section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-6">
          {!r && (
            <Card>
              <CardHeader>
                <CardTitle>What do you want to pay?</CardTitle>
                <CardDescription>
                  Mock providers. No real airtime is sent and no real bill is
                  paid.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap gap-2">
                  {(["telcel", "cfe"] as const).map((p) => (
                    <Button
                      key={p}
                      variant={provider === p ? "default" : "outline"}
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setProvider(p);
                        setAmount(p === "telcel" ? 100 : 250);
                        flow.reset();
                      }}
                    >
                      {p === "telcel"
                        ? "Telcel airtime (mock)"
                        : "CFE electricity (mock)"}
                    </Button>
                  ))}
                </div>
                {provider === "telcel" ? (
                  <>
                    <label className="grid gap-1 text-sm">
                      <span className="text-muted-foreground">
                        Mobile number (10 digits)
                      </span>
                      <Input
                        inputMode="numeric"
                        maxLength={10}
                        value={phone}
                        disabled={busy}
                        onChange={(e) =>
                          editPhone(e.target.value.replace(/\D/g, ""))
                        }
                        className="max-w-56"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {TELCEL_AMOUNTS.map((a) => (
                        <Button
                          key={a}
                          variant={amount === a ? "default" : "outline"}
                          size="sm"
                          disabled={busy}
                          onClick={() => editAmount(a)}
                        >
                          ${a}
                        </Button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <label className="grid gap-1 text-sm">
                      <span className="text-muted-foreground">
                        Service number (12 digits)
                      </span>
                      <Input
                        inputMode="numeric"
                        maxLength={12}
                        value={serviceNumber}
                        disabled={busy}
                        onChange={(e) =>
                          editService(e.target.value.replace(/\D/g, ""))
                        }
                        className="max-w-56"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="text-muted-foreground">
                        Amount (MXN)
                      </span>
                      <Input
                        inputMode="decimal"
                        value={amount}
                        disabled={busy}
                        onChange={(e) =>
                          editAmount(Number(e.target.value) || 0)
                        }
                        className="max-w-32"
                      />
                    </label>
                  </div>
                )}
                <Button onClick={getQuote} disabled={busy} className="w-fit">
                  {flow.stage === "quoting" ? "Getting quote…" : "Get quote"}
                </Button>
              </CardContent>
            </Card>
          )}

          {q && !r && (
            <Card>
              <CardHeader>
                <CardTitle>Checkout</CardTitle>
                <CardDescription>{q.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-1 text-sm">
                  <Line
                    label="You pay"
                    value={`${fmtAmount(BigInt(q.amount))} ${q.tokenSymbol}`}
                    strong
                  />
                  <Line
                    label="Paid to (merchant)"
                    value={
                      <a
                        className="underline-offset-4 hover:underline"
                        href={explorerAddress(q.recipient)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {short(q.recipient)} ↗
                      </a>
                    }
                  />
                  <Line
                    label="Settles via"
                    value="MPP HTTP 402 · Tempo Moderato testnet"
                  />
                  <Line
                    label="Fulfillment"
                    value="SIMULATED (no real top-up)"
                  />
                </div>
                <PayStepper stage={flow.stage} result={r} />
                {flow.stage !== "done" && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={pay}
                      disabled={
                        !address || busy || !flow.canPay || !!insufficient
                      }
                    >
                      {busy
                        ? "Paying…"
                        : `Pay ${fmtAmount(BigInt(q.amount))} ${q.tokenSymbol}`}
                    </Button>
                    {!address && (
                      <span className="text-sm text-muted-foreground">
                        Connect a wallet to pay.
                      </span>
                    )}
                    {insufficient && (
                      <span className="text-sm text-destructive">
                        You hold {fmtAmount(balances.xmxn)} xMXN. Draw an
                        advance on the Get an advance tab first.
                      </span>
                    )}
                  </div>
                )}
                {flow.error && (
                  <p className="text-sm text-destructive">
                    {flow.error}
                    {flow.errorCode === "SETTLEMENT_PENDING" &&
                      " Your payment is unresolved. In about a minute, press Pay again on this same order to check whether it settled. Don't start a new payment."}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your money</CardTitle>
              <CardDescription>Updates after each payment.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Line
                label="xMXN balance"
                value={address ? `${fmtAmount(balances.xmxn)} xMXN` : "—"}
                strong
              />
              <Line
                label="Advance outstanding"
                value={address ? `${fmtAmount(pool.debt)} xMXN` : "—"}
              />
              <p className="text-xs text-muted-foreground">
                Repay on the Get an advance tab. Nothing is deducted
                automatically.
              </p>
            </CardContent>
          </Card>
          <RecentOrders
            orders={recent.orders}
            onRefresh={recent.refresh}
            onCheck={recent.check}
            checks={recent.checks}
          />
        </div>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`text-right tabular-nums ${strong ? "font-semibold" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
