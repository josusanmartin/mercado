"use client";
// Mercado Remesas: send money home + pay the family's airtime and bills. The app runs inside an
// Android phone on desktop (full-screen on phones); beside it, "what just happened" explains the
// flow of funds with the on-chain receipts. All numbers are live; only bill fulfillment is SIMULATED.
import { useEffect, useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { FlowPath, Pulse } from "@/lib/motion";
import { useConnection } from "wagmi";
import type { Address } from "viem";
import { fmtAmount, fmtBps, fmtNumber, shortAddr, toUnits } from "@/lib/format";
import { useReportBusy } from "@/lib/busy";
import { cn } from "@/lib/utils";
import { USE_V2 } from "@/lib/v2/addresses";
import { useRemesaSend } from "@/lib/remesas/use-remesa-send";
import { useFxLabel } from "@/lib/use-fx-label";
import { RecentOrders } from "@/components/billpay/recent-orders";
import { useRecentOrders } from "@/components/billpay/use-bill-pay";
import { Panel, Row, Rows, SettingsLayout } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { useTourPrefill } from "@/components/tour/demo-tour";
import { personaById } from "@/components/wallet/personas";
import { useBillPay } from "@/components/billpay/use-bill-pay";
import { Badge } from "@/components/ui/badge";
import { PhoneFrame } from "@/components/console";
import { PhonePanel } from "@/components/mobile";
import { ONRAMP_LABEL } from "@/lib/remesas/use-onramp";
import { PhoneApp, STAGE_ES, type Screen } from "./phone-app";

export type RemesasState = ReturnType<typeof useRemesasState>;

function useRemesasState() {
  const prefill = useTourPrefill("/remesas");
  const [screen, setScreen] = useState<Screen>("inicio");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  // The chosen contact (Mamá by default); the phone's "Envía a" carousel sets it.
  const [to, setTo] = useState<Address | undefined>(personaById("recipient").address);
  const send = useRemesaSend(toUnits(amount));
  const bill = useBillPay();
  const billBusy = ["quoting", "requesting", "challenge", "signing", "verifying"].includes(bill.stage);
  useReportBusy(billBusy);
  const [last, setLast] = useState<"send" | "bill">();

  // Deep links: /remesas?screen=inicio|enviar|aire|servicios (old /pay lands on airtime).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("screen");
    if (q === "inicio" || q === "enviar" || q === "aire" || q === "servicios") setScreen(q);
  }, []);
  useEffect(() => {
    if (prefill.screen === "airtime") setScreen("aire");
    else if (prefill.amount) {
      setAmount(prefill.amount);
      if (prefill.memo) setMemo(prefill.memo);
      setScreen("enviar");
    }
  }, [prefill.screen, prefill.amount, prefill.memo]);
  useEffect(() => {
    if (bill.stage !== "idle") setLast("bill");
  }, [bill.stage]);

  async function doSend() {
    if (!to) return;
    setLast("send");
    const r = await send.send(to, memo.trim() || undefined).catch(() => undefined);
    if (r) setScreen("enviado");
  }

  return { screen, setScreen, amount, setAmount, memo, setMemo, to, setTo, send, bill, last, doSend };
}

export function RemesasScreen() {
  const s = useRemesasState();

  return (
    <SettingsLayout
      title="Send money home"
      purpose="Dollars in the US become pesos in Mexico in one transaction, and the family's phone and light bills get paid from the same app."
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[360px_minmax(0,1fr)] xl:gap-10">
        <div className="-mx-4 sm:mx-0">
          <ConnectGate persona="sender" why="Mercado Remesas runs on the sender's wallet. Use the demo account or connect your own.">
            <PhoneFrame accent="#E2603F" onAccent="#0a0a0a" label="Mercado Remesas, Android phone preview">
              <PhoneApp s={s} />
            </PhoneFrame>
          </ConnectGate>
        </div>
        <WhatHappened s={s} />
      </div>
    </SettingsLayout>
  );
}

function WhatHappened({ s }: { s: RemesasState }) {
  return (
    <PhonePanel className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
      {s.last === "bill" ? <BillTrace s={s} /> : <SendFlow s={s} />}
      <BillHistory />
      <Honesty />
    </PhonePanel>
  );
}

function SendFlow({ s }: { s: RemesasState }) {
  const { address } = useConnection();
  const q = s.send.quote;
  const fxLabel = useFxLabel();
  const amt = toUnits(s.amount);
  const r = s.send.receipt;
  const inUsd = r ? r.amountIn : amt;
  const out = r ? r.delivered : q.amountOut;
  const mid = q.mid !== undefined ? Number(q.mid) / 1e8 : undefined;
  const rate = out !== undefined && inUsd > 0n ? Number(out) / Number(inUsd) : undefined;
  const quoted = out !== undefined && inUsd > 0n && !q.error;
  // v6 "show, don't tell": the panel leads with the money flow; a dot travels it once there's a quote.
  const flow = (
    <FlowPath
      label="Where the money goes"
      active={!!r || quoted}
      nodes={[
        { label: "Sender (US)", value: inUsd > 0n ? `US$${fmtAmount(inUsd)}` : undefined, sub: "OUSD" },
        { label: q.venue, value: USE_V2 ? "mint" : "swap", sub: rate !== undefined ? `${fmtNumber(rate, 2)} MXN/USD` : "live rate" },
        {
          label: "Mamá (MX)",
          // Stays mounted while a new quote loads ("…"), so the arriving amount pulses instead of remounting.
          value: inUsd > 0n || r ? <Pulse value={out?.toString()}>{out !== undefined && (quoted || r) ? `MX$${fmtAmount(out)}` : "…"}</Pulse> : undefined,
          sub: r ? "delivered" : "quoted",
        },
      ]}
    />
  );
  // V5-TASTE #19 + v6: a designed empty state (the same flow, quiet) instead of a diagram full of dashes.
  if (!r && inUsd === 0n)
    return (
      <Panel title="What will happen">
        {flow}
        <p className="text-muted-foreground mt-4 text-[15px]">Pick an amount to see what your family receives.</p>
      </Panel>
    );
  return (
    <Panel
      title={r ? "What just happened" : "What will happen"}
      description={r ? "Your transfer, read back from the chain." : "The live quote for this amount, and where the money goes."}
      aside={r ? <Badge variant="success">Delivered</Badge> : undefined}
    >
      {flow}
      {/* v6: the numbers behind the quote fold away behind "How it works". */}
      <details className="group mt-5 border-t pt-3">
        <summary className="meta text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-1.5">
          <ChevronRight className="size-3.5 transition-transform duration-200 group-open:rotate-90" aria-hidden />
          How it works
        </summary>
        <Rows className="mt-2">
          <Row label="Oracle mid" sub={fxLabel.short ?? "USD/MXN oracle"} value={mid !== undefined ? `${fmtNumber(mid, 4)} MXN/USD` : "—"} />
          <Row label="Your rate" sub="After fee and size impact" value={rate !== undefined ? `${fmtNumber(rate, 4)} MXN/USD` : "—"} />
          <Row
            label="Cost vs. mid"
            sub="Everything you pay, in basis points"
            value={rate !== undefined && mid ? `${fmtNumber(((mid - rate) / mid) * 10_000, 0)} bps` : "—"}
          />
          {USE_V2 && <Row label="Size impact" value={q.impactBps !== undefined ? fmtBps(q.impactBps, 2) : "—"} />}
          <Row label="Minimum received" sub="Below this the transaction reverts and nothing moves" value={q.minOut !== undefined && !r ? `${fmtAmount(q.minOut)} xMXN` : "—"} />
          <Row label="Venue" sub={USE_V2 ? "OUSD into the reserve, xMXN minted to the recipient" : "Desk inventory, then a transfer"} value={q.venue} />
          <FeeRow steps={s.send.tx.steps} account={address} />
        </Rows>
      </details>
      {s.send.tx.steps.length > 0 && (
        <ul className="mt-4 grid gap-1.5">
          {s.send.tx.steps.map((st) => (
            <li key={st.hash}>
              <a href={st.url} target="_blank" rel="noreferrer" className="hover:bg-well flex items-center gap-2 rounded-md px-1 py-1 text-sm">
                <span className={cn("size-2 rounded-full", st.receipt ? "bg-success" : "bg-warning")} />
                <span className="flex-1">{st.label}</span>
                <span className="text-muted-foreground font-mono text-[13px]">{st.hash.slice(0, 10)}…</span>
                <ExternalLink className="text-muted-foreground size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {r?.memo && <p className="text-muted-foreground mt-3 text-sm">Note stored on-chain with the transfer: &ldquo;{r.memo}&rdquo;</p>}
    </Panel>
  );
}

/** Who paid the network fee, read from the receipts (Tempo receipts carry the fee payer). */
function FeeRow({ steps, account }: { steps: { receipt?: unknown }[]; account?: string }) {
  const payers = steps
    .map((st) => (st.receipt as { feePayer?: string } | undefined)?.feePayer)
    .filter((x): x is string => typeof x === "string");
  const sponsored = account && payers.length > 0 && payers.every((p) => p.toLowerCase() !== account.toLowerCase());
  return (
    <Row
      label="Network fee"
      sub={payers.length ? `Paid by ${shortAddr(payers[0])}${sponsored ? ", Mercado's testnet fee sponsor" : ""}` : "Paid by Mercado's testnet sponsor when eligible, else in a USD test token"}
      value={payers.length ? (sponsored ? "Sponsored" : "Paid by you") : "—"}
    />
  );
}

const BILL_STEPS = [
  { id: "requesting", label: "POST /api/bills/pay", sub: "Order created for this quote" },
  { id: "challenge", label: "402 Payment Required", sub: "The server answers with an amount-bound MPP challenge" },
  { id: "signing", label: "Payment sent in xMXN", sub: "A real transfer on Tempo to the merchant" },
  { id: "verifying", label: "Payment verified", sub: "The server checks the on-chain receipt before fulfilling" },
  { id: "done", label: "Top-up: SIMULATED", sub: "No real airtime or bill payment is delivered" },
];

function BillTrace({ s }: { s: RemesasState }) {
  const bill = s.bill;
  const at = BILL_STEPS.findIndex((x) => x.id === bill.stage);
  const r = bill.result;
  return (
    <Panel
      title="What just happened"
      description={bill.quote?.description ?? "Paying the family's bill over HTTP 402."}
      aside={<Badge variant="mock">Fulfillment SIMULATED</Badge>}
    >
      <ol className="grid gap-2">
        {BILL_STEPS.map((st, i) => {
          const done = bill.stage === "done" || (at >= 0 && i < at);
          const now = i === at && bill.stage !== "done";
          return (
            <li key={st.id} className="flex items-start gap-3">
              <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", done ? "bg-success" : now ? "bg-product animate-pulse" : "bg-input")} />
              <div>
                <p className={cn("text-[15px]", !done && !now && "text-muted-foreground")}>
                  {st.label} {now && <span className="text-muted-foreground text-[13px]">· {STAGE_ES[st.id] ?? ""}</span>}
                </p>
                <p className="text-muted-foreground text-[13px]">{st.sub}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {r && (
        <Rows className="mt-4">
          <Row label="Payment (real, on Tempo)" value={<a href={r.receipt.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[13px] hover:underline">{r.receipt.txHash.slice(0, 12)}… <ExternalLink className="size-3" /></a>} />
          <Row label="Amount" value={`${fmtAmount(BigInt(r.receipt.amount))} xMXN`} />
          <Row label="Order" sub={r.status} value={<span className="font-mono text-[13px]">{r.orderId.slice(0, 12)}…</span>} />
          <Row label="Top-up reference" sub="SIMULATED fulfillment, no real top-up" value={<span className="font-mono text-[13px]">{r.fulfillment?.reference ?? "—"}</span>} />
        </Rows>
      )}
      {bill.error && <p className="text-destructive mt-3 text-sm">{bill.error}</p>}
    </Panel>
  );
}

/** api's saved-order list: history plus the credential-less settlement check for unpaid orders (R-018). */
function BillHistory() {
  const { orders, refresh, check, checks } = useRecentOrders();
  if (orders.length === 0) return null;
  return <RecentOrders orders={orders} onRefresh={refresh} onCheck={check} checks={checks} />;
}

function Honesty() {
  return (
    <Panel title="What's real here">
      <Rows>
        <Row label="Dollars and pesos" sub="Testnet OUSD and xMXN, no real value; xMXN can't be cashed out at a bank (no SPEI)" value={<Badge variant="secondary">Testnet</Badge>} />
        <Row label="Transfers and payments" sub="Real transactions on Tempo Moderato, each with an explorer link" value={<Badge variant="success">Real</Badge>} />
        <Row label="Telcel and CFE" sub="We take a real payment, but no airtime or bill payment is delivered" value={<Badge variant="mock">SIMULATED</Badge>} />
        <Row label="Exchange rate" sub="A real USD/MXN rate relayed on-chain by an admin key; not a decentralized oracle" value={<Badge variant="mock">Admin relay</Badge>} />
        <Row label="Rate sparkline (phone)" sub="Only the relay's real on-chain setPrice pushes; admin stress overrides (forceSet) are excluded" value={<Badge variant="success">Real</Badge>} />
        <Row label="Contacts" sub="Mamá, Papá and Ana are demo contacts, each with a real testnet wallet" value={<Badge variant="mock">Demo</Badge>} />
        <Row label="Add dollars with a card" sub={ONRAMP_LABEL} value={<Badge variant="mock">Simulated</Badge>} />
      </Rows>
    </Panel>
  );
}
