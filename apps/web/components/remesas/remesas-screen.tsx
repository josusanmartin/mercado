"use client";
// Mercado Remesas: send money home + pay the family's airtime and bills. The app runs inside an
// Android phone on desktop (full-screen on phones); beside it, "what just happened" explains the
// flow of funds with the on-chain receipts. All numbers are live; only bill fulfillment is SIMULATED.
import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useConnection } from "wagmi";
import { PROTOCOL, useBalances, useOracle, useThreeBuckets } from "@/lib/contracts";
import { fmtAmount, fmtBps, fmtNumber, shortAddr, toUnits } from "@/lib/format";
import { useReportBusy } from "@/lib/busy";
import { cn } from "@/lib/utils";
import { USE_V2, V2 } from "@/lib/v2/addresses";
import { useTokenBalance } from "@/lib/v2/reads";
import { useRemesaSend } from "@/lib/remesas/use-remesa-send";
import { Panel, Row, Rows, SettingsLayout } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { useTourPrefill } from "@/components/tour/demo-tour";
import { personaById } from "@/components/wallet/personas";
import { useBillPay } from "@/components/billpay/use-bill-pay";
import { Badge } from "@/components/ui/badge";
import { AndroidFrame } from "./android-frame";
import { PhoneApp, STAGE_ES, type Screen } from "./phone-app";

export type RemesasState = ReturnType<typeof useRemesasState>;

function useRemesasState() {
  const prefill = useTourPrefill("/remesas");
  const [screen, setScreen] = useState<Screen>("inicio");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const send = useRemesaSend(toUnits(amount));
  const bill = useBillPay();
  const billBusy = ["quoting", "requesting", "challenge", "signing", "verifying"].includes(bill.stage);
  useReportBusy(billBusy);
  const [last, setLast] = useState<"send" | "bill">();

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
    const to = personaById("recipient").address;
    if (!to) return;
    setLast("send");
    const r = await send.send(to, memo.trim() || undefined).catch(() => undefined);
    if (r) setScreen("enviado");
  }

  return { screen, setScreen, amount, setAmount, memo, setMemo, send, bill, last, doSend };
}

export function RemesasScreen() {
  const s = useRemesasState();
  const fx = useOracle();
  const b = useThreeBuckets();
  const mama = personaById("recipient");
  const familyV1 = useBalances(mama.address);
  const familyV2 = useTokenBalance(USE_V2 ? V2.xmxn : undefined, mama.address);
  const family = USE_V2 ? familyV2.data : familyV1.xmxn;

  return (
    <SettingsLayout
      title="Send money home"
      purpose="Dollars in the US become pesos in Mexico in one transaction, and the family's phone and light bills get paid from the same app."
      kpis={[
        { label: "Today's rate (mock oracle)", value: fx.rate === undefined ? "—" : fmtNumber(fx.rate, 2), sub: "MXN per USD, admin-relayed testnet feed" },
        PROTOCOL === "v2"
          ? { label: "Exchange backing", value: b.move?.coverageBps === undefined ? "—" : fmtBps(b.move.coverageBps, 0), sub: "OUSD reserve vs xMXN issued" }
          : { label: "Ready to send", value: b.desk.xmxn === undefined ? "—" : fmtAmount(b.desk.xmxn, 0), sub: "xMXN on the swap desk" },
        { label: "Familia (MX) balance", value: family === undefined ? "—" : fmtAmount(family, 0), sub: `xMXN in ${shortAddr(mama.address)}` },
      ]}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10">
        <div className="-mx-4 sm:mx-0">
          <ConnectGate persona="sender" why="Mercado Remesas runs on the sender's wallet. Use the demo account or connect your own.">
            <AndroidFrame>
              <PhoneApp s={s} />
            </AndroidFrame>
          </ConnectGate>
        </div>
        <WhatHappened s={s} />
      </div>
    </SettingsLayout>
  );
}

function WhatHappened({ s }: { s: RemesasState }) {
  return (
    <div className="grid content-start gap-6">
      {s.last === "bill" ? <BillTrace s={s} /> : <SendFlow s={s} />}
      <Honesty />
    </div>
  );
}

function FlowNode({ title, value, sub, accent }: { title: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("min-w-0 flex-1 rounded-[14px] p-3", accent ? "bg-product text-white" : "bg-well")}>
      <p className={cn("text-[13px]", accent ? "text-white/85" : "text-muted-foreground")}>{title}</p>
      <p className="truncate text-lg font-semibold tabular">{value}</p>
      {sub && <p className={cn("truncate text-[13px]", accent ? "text-white/85" : "text-muted-foreground")}>{sub}</p>}
    </div>
  );
}

function SendFlow({ s }: { s: RemesasState }) {
  const { address } = useConnection();
  const q = s.send.quote;
  const amt = toUnits(s.amount);
  const r = s.send.receipt;
  const inUsd = r ? r.amountIn : amt;
  const out = r ? r.delivered : q.amountOut;
  const mid = q.mid !== undefined ? Number(q.mid) / 1e8 : undefined;
  const rate = out !== undefined && inUsd > 0n ? Number(out) / Number(inUsd) : undefined;
  return (
    <Panel
      title={r ? "What just happened" : "What will happen"}
      description={r ? "Your transfer, read back from the chain." : "Pick an amount on the phone to see the live quote and where the money goes."}
      aside={r ? <Badge variant="success">Delivered</Badge> : undefined}
    >
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <FlowNode title="Sender (US)" value={inUsd > 0n ? `$${fmtAmount(inUsd)}` : "$0.00"} sub={`OUSD · ${shortAddr(address)}`} />
        <ArrowRight className="text-muted-foreground mx-auto size-4 shrink-0 rotate-90 sm:rotate-0" aria-hidden />
        <FlowNode title={q.venue} value={USE_V2 ? "mint" : "swap"} sub={USE_V2 ? "OUSD into the reserve, xMXN minted" : "desk inventory, then a transfer"} accent />
        <ArrowRight className="text-muted-foreground mx-auto size-4 shrink-0 rotate-90 sm:rotate-0" aria-hidden />
        <FlowNode title="Mamá (MX)" value={out !== undefined && inUsd > 0n ? `${fmtAmount(out)} MXN` : "—"} sub={r ? "confirmed on-chain" : "estimated"} />
      </div>
      <Rows className="mt-4">
        <Row label="Oracle mid" sub="Mock admin oracle, testnet" value={mid !== undefined ? `${fmtNumber(mid, 4)} MXN/USD` : "—"} />
        <Row label="Your rate" sub="After fee and size impact" value={rate !== undefined ? `${fmtNumber(rate, 4)} MXN/USD` : "—"} />
        <Row
          label="Cost vs. mid"
          sub="Everything you pay, in basis points"
          value={rate !== undefined && mid ? `${fmtNumber(((mid - rate) / mid) * 10_000, 0)} bps` : "—"}
        />
        {USE_V2 && <Row label="Size impact" value={q.impactBps !== undefined ? fmtBps(q.impactBps, 2) : "—"} />}
        <Row label="Minimum received" sub="Below this the transaction reverts and nothing moves" value={q.minOut !== undefined && !r ? `${fmtAmount(q.minOut)} xMXN` : "—"} />
        <FeeRow steps={s.send.tx.steps} account={address} />
      </Rows>
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

function Honesty() {
  return (
    <Panel title="What's real here">
      <Rows>
        <Row label="Dollars and pesos" sub="Testnet OUSD and xMXN, no real value; xMXN can't be cashed out at a bank (no SPEI)" value={<Badge variant="secondary">Testnet</Badge>} />
        <Row label="Transfers and payments" sub="Real transactions on Tempo Moderato, each with an explorer link" value={<Badge variant="success">Real</Badge>} />
        <Row label="Telcel and CFE" sub="We take a real payment, but no airtime or bill payment is delivered" value={<Badge variant="mock">SIMULATED</Badge>} />
        <Row label="Exchange rate" sub="Admin-relayed testnet feed, not a decentralized oracle" value={<Badge variant="mock">Mock oracle</Badge>} />
      </Rows>
    </Panel>
  );
}
