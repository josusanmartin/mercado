"use client";
// "Pay bills" in the console Settings layout: Bill · Checkout · Receipt · History.
// Quote a mock Telcel top-up (or CFE bill) → pay through a real MPP HTTP 402 flow with the connected
// wallet → on-chain receipt next to the SIMULATED fulfillment and the remaining advance.
import { useEffect, useState } from "react";
import { History, Receipt, ShoppingCart, Smartphone } from "lucide-react";
import { useConnection } from "wagmi";
import type { BillProviderId } from "@mercado/shared";
import { explorerAddress } from "@mercado/shared";
import {
  BigNumber,
  ListPane,
  Panel,
  PanelActions,
  Row,
  Rows,
  SettingsLayout,
} from "@/components/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBalances, usePool } from "@/lib/contracts";
import { useReportBusy } from "@/lib/busy";
import { fmtAmount } from "@/lib/format";
import { PayStepper } from "./pay-stepper";
import { RecentOrders } from "./recent-orders";
import { TELCEL_AMOUNTS, useBillPay, useRecentOrders } from "./use-bill-pay";

type Section = "bill" | "checkout" | "receipt" | "history";

const LABELS = (
  <div className="flex flex-wrap gap-2">
    <Badge variant="success">Payment: real testnet transfer</Badge>
    <Badge variant="mock">Fulfillment: SIMULATED</Badge>
  </div>
);

export function PayScreen() {
  const { address } = useConnection();
  const flow = useBillPay();
  const recent = useRecentOrders();
  const balances = useBalances();
  const pool = usePool();
  const [section, setSection] = useState<Section>("bill");

  const [provider, setProvider] = useState<BillProviderId>("telcel");
  const [phone, setPhone] = useState("5512345678");
  const [serviceNumber, setServiceNumber] = useState("123456789012");
  const [amount, setAmount] = useState(100);

  const q = flow.quote;
  const r = flow.result;
  const busy = [
    "quoting",
    "requesting",
    "challenge",
    "signing",
    "verifying",
  ].includes(flow.stage);
  // R-012: lock persona switching / the Tour while a payment is in flight.
  useReportBusy(busy);
  const insufficient =
    q && balances.xmxn !== undefined && balances.xmxn < BigInt(q.amount);

  // Move the panel along with the flow: quote → Checkout, paid → Receipt.
  useEffect(() => {
    if (flow.stage === "quoted") setSection("checkout");
  }, [flow.stage]);
  useEffect(() => {
    if (r) setSection("receipt");
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
  const editProvider = (p: BillProviderId) => {
    if (busy) return;
    setProvider(p);
    setAmount(p === "telcel" ? 100 : 250);
    flow.reset();
  };

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
  const another = () => {
    flow.reset();
    setSection("bill");
  };

  const items = [
    {
      id: "bill",
      label: "Bill",
      icon: Smartphone,
      hint: provider === "telcel" ? "Telcel" : "CFE",
    },
    {
      id: "checkout",
      label: "Checkout",
      icon: ShoppingCart,
      hint: q && !r ? fmtAmount(BigInt(q.amount), 0) : undefined,
    },
    {
      id: "receipt",
      label: "Receipt",
      icon: Receipt,
      hint: r
        ? r.status === "FULFILLED_SIMULATED"
          ? "Done"
          : "Failed"
        : undefined,
    },
    {
      id: "history",
      label: "History",
      icon: History,
      hint: recent.orders.length ? String(recent.orders.length) : undefined,
    },
  ];

  return (
    <SettingsLayout
      title="Pay bills"
      list={
        <ListPane
          label="Pay sections"
          items={items}
          value={section}
          onChange={(id) => setSection(id as Section)}
        />
      }
    >
      {section === "bill" && (
        <Panel
          title="What do you want to pay?"
          description="Pay with xMXN through a real HTTP 402 payment (MPP) on Tempo. Mock providers: no real airtime is sent and no real bill is paid."
          aside={LABELS}
        >
          <Rows>
            <Row
              label="Provider"
              value={
                <div
                  data-nav="row"
                  className="flex flex-wrap justify-end gap-2"
                >
                  {(["telcel", "cfe"] as const).map((p) => (
                    <Button
                      key={p}
                      data-nav-item=""
                      size="sm"
                      variant={provider === p ? "default" : "outline"}
                      disabled={busy}
                      onClick={() => editProvider(p)}
                    >
                      {p === "telcel"
                        ? "Telcel airtime (mock)"
                        : "CFE electricity (mock)"}
                    </Button>
                  ))}
                </div>
              }
            />
            {provider === "telcel" ? (
              <>
                <Row
                  label="Mobile number"
                  sub="10 digits"
                  value={
                    <Input
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      disabled={busy}
                      onChange={(e) =>
                        editPhone(e.target.value.replace(/\D/g, ""))
                      }
                      className="w-44 text-right"
                    />
                  }
                />
                <Row
                  label="Amount"
                  sub="MXN"
                  value={
                    <div
                      data-nav="row"
                      className="flex max-w-80 flex-wrap justify-end gap-2"
                    >
                      {TELCEL_AMOUNTS.map((a) => (
                        <Button
                          key={a}
                          data-nav-item=""
                          size="sm"
                          variant={amount === a ? "default" : "outline"}
                          disabled={busy}
                          onClick={() => editAmount(a)}
                        >
                          ${a}
                        </Button>
                      ))}
                    </div>
                  }
                />
              </>
            ) : (
              <>
                <Row
                  label="Service number"
                  sub="12 digits"
                  value={
                    <Input
                      inputMode="numeric"
                      maxLength={12}
                      value={serviceNumber}
                      disabled={busy}
                      onChange={(e) =>
                        editService(e.target.value.replace(/\D/g, ""))
                      }
                      className="w-44 text-right"
                    />
                  }
                />
                <Row
                  label="Amount"
                  sub="MXN, 20 to 1,500"
                  value={
                    <Input
                      inputMode="decimal"
                      value={amount}
                      disabled={busy}
                      onChange={(e) => editAmount(Number(e.target.value) || 0)}
                      className="w-32 text-right"
                    />
                  }
                />
              </>
            )}
          </Rows>
          <PanelActions>
            <Button size="lg" onClick={getQuote} disabled={busy}>
              {flow.stage === "quoting" ? "Getting quote…" : "Get quote"}
            </Button>
          </PanelActions>
          {flow.error && !q && (
            <p className="text-destructive pt-3 text-sm">{flow.error}</p>
          )}
        </Panel>
      )}

      {section === "checkout" && (
        <Panel title="Checkout" description={q?.description} aside={LABELS}>
          {r ? (
            <Empty>Paid. See Receipt.</Empty>
          ) : !q ? (
            <Empty>Get a quote first (Bill).</Empty>
          ) : (
            <>
              <div className="py-4">
                <p className="text-muted-foreground text-sm">You pay</p>
                <BigNumber
                  value={fmtAmount(BigInt(q.amount))}
                  unit={q.tokenSymbol}
                />
              </div>
              <Rows>
                <Row
                  label="Paid to (merchant)"
                  value={
                    <a
                      className="font-mono hover:underline"
                      href={explorerAddress(q.recipient)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(q.recipient)} ↗
                    </a>
                  }
                />
                <Row
                  label="Settles via"
                  value="MPP HTTP 402 · Tempo Moderato"
                />
                <Row label="Fulfillment" value="SIMULATED, no real top-up" />
                <Row
                  label="Your xMXN balance"
                  value={address ? `${fmtAmount(balances.xmxn)} xMXN` : "—"}
                />
              </Rows>
              <div className="pt-5">
                <PayStepper stage={flow.stage} result={r} />
              </div>
              <PanelActions>
                <Button
                  size="lg"
                  onClick={pay}
                  disabled={!address || busy || !flow.canPay || !!insufficient}
                >
                  {busy
                    ? "Paying…"
                    : `Pay ${fmtAmount(BigInt(q.amount))} ${q.tokenSymbol}`}
                </Button>
              </PanelActions>
              {!address && (
                <p className="text-muted-foreground pt-3 text-sm">
                  Connect a wallet to pay.
                </p>
              )}
              {insufficient && (
                <p className="text-destructive pt-3 text-sm">
                  You hold {fmtAmount(balances.xmxn)} xMXN. Draw an advance on
                  Get an advance first.
                </p>
              )}
              {flow.error && (
                <p className="text-destructive pt-3 text-sm">
                  {flow.error}
                  {flow.errorCode === "SETTLEMENT_PENDING" &&
                    " Your payment is unresolved. In about a minute, press Pay again on this same order to check whether it settled. Don't start a new payment."}
                </p>
              )}
            </>
          )}
        </Panel>
      )}

      {section === "receipt" && (
        <Panel
          title="Receipt"
          description="The payment is a real testnet transfer, verified on-chain before anything was fulfilled. The top-up is simulated."
          aside={LABELS}
        >
          {!r ? (
            <Empty>No payment yet.</Empty>
          ) : (
            <div aria-live="polite">
              <p className="text-muted-foreground pt-4 text-sm">
                Payment · on-chain
              </p>
              <Rows>
                <Row
                  label="Amount"
                  value={`${fmtAmount(BigInt(r.receipt.amount))} ${q?.tokenSymbol ?? "xMXN"}`}
                />
                {r.receipt.payer && (
                  <Row
                    label="From"
                    value={
                      <span className="font-mono">
                        {short(r.receipt.payer)}
                      </span>
                    }
                  />
                )}
                <Row
                  label="To (merchant)"
                  value={
                    <span className="font-mono">
                      {short(r.receipt.recipient)}
                    </span>
                  }
                />
                <Row
                  label="Transaction"
                  value={
                    <a
                      className="font-mono hover:underline"
                      href={r.receipt.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(r.receipt.txHash)} ↗
                    </a>
                  }
                />
              </Rows>

              <p className="text-muted-foreground flex items-center gap-2 pt-6 text-sm">
                Top-up <Badge variant="mock">SIMULATED</Badge>
              </p>
              <Rows>
                {r.status === "FULFILLED_SIMULATED" && r.fulfillment ? (
                  <>
                    <Row label="Reference" value={r.fulfillment.reference} />
                    <Row
                      label="Provider"
                      value={r.fulfillment.providerName}
                      sub={r.fulfillment.label}
                    />
                  </>
                ) : (
                  <Row
                    label="Status"
                    value={
                      <span className="text-destructive">
                        {r.paidButUnfulfilled
                          ? "Paid, not fulfilled"
                          : r.status}
                      </span>
                    }
                    sub={
                      r.paidButUnfulfilled
                        ? "The (simulated) provider rejected it. Your payment is recorded and flagged for a refund."
                        : undefined
                    }
                  />
                )}
              </Rows>

              <p className="text-muted-foreground pt-6 text-sm">
                Your advance · on-chain
              </p>
              <Rows>
                <Row
                  label="Still owed"
                  value={
                    pool.debt !== undefined
                      ? `${fmtAmount(pool.debt)} xMXN`
                      : "—"
                  }
                  sub="Repay on Get an advance. Nothing is deducted automatically."
                />
                <Row
                  label="xMXN left"
                  value={
                    balances.xmxn !== undefined
                      ? `${fmtAmount(balances.xmxn)} xMXN`
                      : "—"
                  }
                />
              </Rows>
              <PanelActions>
                <Button size="lg" variant="outline" onClick={another}>
                  Pay another bill
                </Button>
              </PanelActions>
            </div>
          )}
        </Panel>
      )}

      {section === "history" && (
        <RecentOrders
          orders={recent.orders}
          onRefresh={recent.refresh}
          onCheck={recent.check}
          checks={recent.checks}
        />
      )}
    </SettingsLayout>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground py-6 text-[15px]">{children}</p>;
}

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
