"use client";
// The Remesas mobile app (inside the Android frame on desktop, full-screen on phones).
// Spanish first, English sub-labels. Every number is live: balances and quotes from chain, payments
// through the real MPP 402 flow. Only airtime/bill FULFILLMENT is simulated, and it says so.
import { useState } from "react";
import { useConnection } from "wagmi";
import { ArrowLeft, Check, ChevronRight, ExternalLink, Lightbulb, Loader2, Phone, Send, Smartphone } from "lucide-react";
import { MEMO_MAX_BYTES, memoByteLength, useBalances } from "@/lib/contracts";
import { useActivity } from "@/lib/activity";
import { fmtAmount, fmtNumber, shortAddr, timeAgo, toUnits } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { personaById } from "@/components/wallet/personas";
import { TELCEL_AMOUNTS } from "@/components/billpay/use-bill-pay";
import type { RemesasState } from "./remesas-screen";
import { PhoneKeypad as Keypad } from "@/components/console";

export type Screen = "inicio" | "enviar" | "enviado" | "aire" | "servicios";

const ACCENT = "#ff8a1f";

export function PhoneApp({ s }: { s: RemesasState }) {
  const { screen } = s;
  return (
    <div className="flex min-h-full flex-col bg-[#ffffff] text-[#111418]">
      {screen === "inicio" && <Inicio s={s} />}
      {screen === "enviar" && <Enviar s={s} />}
      {screen === "enviado" && <Enviado s={s} />}
      {(screen === "aire" || screen === "servicios") && <Pagar s={s} kind={screen} />}
    </div>
  );
}

function Header({ title, sub, onBack }: { title: string; sub: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-2 pb-3">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Atrás / Back" className="grid size-9 place-items-center rounded-full hover:bg-[#f4f5f7]">
          <ArrowLeft className="size-5" />
        </button>
      )}
      <div>
        <p className="text-[17px] leading-tight font-semibold">{title}</p>
        <p className="text-xs text-[#5b6270]">{sub}</p>
      </div>
    </div>
  );
}

function Inicio({ s }: { s: RemesasState }) {
  const { address } = useConnection();
  const bal = useBalances();
  const activity = useActivity(address).slice(0, 4);
  const now = useNow(30_000);
  const mama = personaById("recipient");
  return (
    <div className="grid gap-4 px-4 pb-6">
      <div className="pt-3">
        <p className="text-xs text-[#5b6270]">Hola · Hello</p>
        <p className="text-xl font-semibold">Envía a casa en segundos</p>
      </div>
      <div className="rounded-[20px] p-4 text-white" style={{ background: ACCENT }}>
        <p className="text-xs font-medium opacity-80">Tu saldo · Your balance</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular">{bal.ousd === undefined ? "—" : `$${fmtAmount(bal.ousd)}`}</p>
        <p className="text-xs opacity-80">testnet OUSD, no real value</p>
        <p className="mt-2 text-sm font-medium tabular">{bal.xmxn === undefined ? "" : `${fmtAmount(bal.xmxn)} xMXN en pesos`}</p>
      </div>
      <button
        type="button"
        onClick={() => s.setScreen("enviar")}
        className="flex items-center justify-between rounded-[14px] bg-[#111418] px-4 py-4 text-left text-[#ffffff]"
      >
        <span>
          <span className="block text-[17px] font-semibold">Enviar a México</span>
          <span className="block text-xs opacity-70">Send money home · to {mama.name}</span>
        </span>
        <Send className="size-5" />
      </button>
      <div className="grid grid-cols-2 gap-3">
        <Tile icon={<Smartphone className="size-5" />} title="Recargar Tiempo Aire" sub="Airtime top-up" onClick={() => s.setScreen("aire")} />
        <Tile icon={<Lightbulb className="size-5" />} title="Pagar servicios" sub="Pay bills (CFE)" onClick={() => s.setScreen("servicios")} />
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">
          Movimientos <span className="font-normal text-[#5b6270]">· Activity</span>
        </p>
        {activity.length === 0 ? (
          <p className="text-sm text-[#5b6270]">Aún no hay movimientos desde este navegador · No activity yet</p>
        ) : (
          <ul className="divide-y divide-[#e6e8ec]">
            {activity.map((a) => (
              <li key={a.hash}>
                <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-2 text-sm">
                  <span className="size-1.5 rounded-full bg-[#079455]" />
                  <span className="flex-1 truncate">{a.label}</span>
                  <span className="text-xs text-[#5b6270] tabular">{now ? timeAgo(a.at / 1000, now) : ""}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Tile({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="grid gap-2 rounded-[14px] border border-[#e6e8ec] bg-white p-3 text-left hover:border-[#ff8a1f]">
      <span className="grid size-9 place-items-center rounded-[10px] text-white" style={{ background: ACCENT }}>
        {icon}
      </span>
      <span>
        <span className="block text-sm leading-tight font-semibold">{title}</span>
        <span className="block text-xs text-[#5b6270]">{sub}</span>
      </span>
    </button>
  );
}

function Enviar({ s }: { s: RemesasState }) {
  const bal = useBalances();
  const mama = personaById("recipient");
  const { send, amount, setAmount, memo, setMemo } = s;
  const amt = toUnits(amount);
  const q = send.quote;
  const rate = q.amountOut !== undefined && amt > 0n ? Number(q.amountOut) / Number(amt) : undefined;
  const overBalance = bal.ousd !== undefined && amt > bal.ousd;
  const memoTooLong = memoByteLength(memo) > MEMO_MAX_BYTES;
  const busy = send.tx.isBusy;
  const can = !busy && amt > 0n && !overBalance && !memoTooLong && q.amountOut !== undefined && !q.error && !!mama.address;

  return (
    <div className="flex min-h-full flex-col">
      <Header title="Enviar a México" sub="Send money home" onBack={busy ? undefined : () => s.setScreen("inicio")} />
      <div className="grid gap-3 px-4">
        <div className="text-center">
          <p className="text-xs text-[#5b6270]">Envías · You send</p>
          <p className="text-[2.6rem] leading-none font-semibold tracking-tight tabular">${amount || "0"}</p>
          <p className="text-xs text-[#5b6270]">USD (testnet OUSD) · saldo {bal.ousd === undefined ? "—" : `$${fmtAmount(bal.ousd)}`}</p>
        </div>
        <div className="rounded-[12px] bg-[#f4f5f7] px-3 py-2.5 text-center">
          <p className="text-xs text-[#5b6270]">{mama.name === "Familia (MX)" ? "Mamá" : mama.name} recibe · receives about</p>
          <p className="text-2xl font-semibold tabular" style={{ color: "#111418" }}>
            {q.amountOut !== undefined && amt > 0n ? `${fmtAmount(q.amountOut)} MXN` : q.loading && amt > 0n ? "…" : "0.00 MXN"}
          </p>
          <p className="text-[13px] text-[#5b6270]">
            {rate !== undefined ? `1 USD = ${fmtNumber(rate, 4)} MXN · ${q.venue}` : "Cotización en vivo · live quote"}
          </p>
          {q.error && amt > 0n && <p className="mt-1 text-xs text-[#d92d20]">{q.error}</p>}
          {overBalance && <p className="mt-1 text-xs text-[#d92d20]">Saldo insuficiente · not enough balance</p>}
        </div>
        <div className="flex items-center gap-3 rounded-[12px] border border-[#e6e8ec] bg-white p-3">
          <span className="grid size-9 place-items-center rounded-full bg-[#111418] text-sm font-semibold text-[#ffffff]">M</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Mamá · Guadalajara</p>
            <p className="truncate font-mono text-[13px] text-[#5b6270]">{mama.name}, demo wallet · {shortAddr(mama.address)}</p>
          </div>
          <ChevronRight className="size-4 text-[#5b6270]" aria-hidden />
        </div>
        <label className="grid gap-1">
          <span className="flex justify-between text-xs text-[#5b6270]">
            <span>Nota · Note (on-chain, public)</span>
            <span className={cn("tabular", memoTooLong && "text-[#d92d20]")}>
              {memoByteLength(memo)}/{MEMO_MAX_BYTES}
            </span>
          </span>
          <input
            value={memo}
            onChange={(e) => s.setMemo(e.target.value)}
            disabled={busy}
            placeholder="para mamá"
            className="h-10 rounded-[10px] border border-[#e6e8ec] bg-white px-3 text-sm"
          />
        </label>
      </div>
      <div className="mt-auto px-3 pt-2">
        <Keypad value={amount} onChange={setAmount} disabled={busy} />
        <button
          type="button"
          disabled={!can}
          onClick={() => s.doSend()}
          className="mt-2 mb-2 flex h-12 w-full items-center justify-center gap-2 rounded-[12px] text-[16px] font-semibold disabled:opacity-40"
          style={{ background: ACCENT, color: "#ffffff" }}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {send.tx.stepLabel ?? "Enviando"}…
            </>
          ) : (
            <>Enviar ${amount || "0"} · Send</>
          )}
        </button>
        {send.tx.status === "error" && send.tx.error && !send.stranded && <p className="mb-2 px-1 text-[13px] text-[#d92d20]">{send.tx.error}</p>}
        {send.stranded && (
          <div className="mb-2 grid gap-1.5 rounded-[14px] bg-[#f4f5f7] p-3 text-[13px]">
            <p>
              Ya convertimos tus dólares, pero la entrega falló. Los {fmtAmount(send.stranded.amount)} MXN están en tu cuenta · Your dollars were converted but the delivery
              failed; the pesos are in your wallet.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const r = await send.deliverStranded().catch(() => undefined);
                if (r) s.setScreen("enviado");
              }}
              className="h-10 rounded-[10px] text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: ACCENT }}
            >
              Enviar esos {fmtAmount(send.stranded.amount)} MXN a Mamá · Deliver them
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Enviado({ s }: { s: RemesasState }) {
  const r = s.send.receipt;
  return (
    <div className="flex min-h-full flex-col items-center px-5 pt-10 pb-6 text-center">
      <span className="grid size-16 place-items-center rounded-full text-white" style={{ background: ACCENT }}>
        <Check className="size-8" />
      </span>
      <p className="mt-4 text-xl font-semibold">¡Enviado! · Sent</p>
      {r && (
        <>
          <p className="mt-2 text-[2.2rem] leading-none font-semibold tabular" style={{ color: "#111418" }}>
            {fmtAmount(r.delivered)} MXN
          </p>
          <p className="mt-1 text-sm text-[#5b6270]">llegaron a Mamá · arrived in Mamá&apos;s wallet</p>
          {r.memo && <p className="mt-3 rounded-full bg-[#f4f5f7] px-3 py-1 text-sm">&ldquo;{r.memo}&rdquo;</p>}
          <a href={r.steps.at(-1)?.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
            Ver en el explorador · View on explorer <ExternalLink className="size-3.5" />
          </a>
          <p className="mt-4 text-xs text-[#5b6270]">Entrega on-chain. Sin retiro a banco (SPEI) en este prototipo · On-chain delivery only.</p>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          s.send.reset();
          s.setAmount("");
          s.setScreen("inicio");
        }}
        className="mt-auto h-12 w-full rounded-[12px] bg-[#111418] text-[16px] font-semibold text-[#ffffff]"
      >
        Listo · Done
      </button>
    </div>
  );
}

const CFE_AMOUNTS = [150, 300, 500];

function Pagar({ s, kind }: { s: RemesasState; kind: "aire" | "servicios" }) {
  const bill = s.bill;
  const { address } = useConnection();
  const bal = useBalances();
  const airtime = kind === "aire";
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [mxn, setMxn] = useState<number>(airtime ? 100 : 300);
  const inFlight = ["quoting", "requesting", "challenge", "signing", "verifying"].includes(bill.stage);
  const valid = airtime ? /^\d{10}$/.test(phone) : /^\d{12}$/.test(service);
  const amounts = airtime ? TELCEL_AMOUNTS.filter((a) => a >= 20 && a <= 200) : CFE_AMOUNTS;
  const quoteAmount = bill.quote ? BigInt(bill.quote.amount) : undefined;
  const short = quoteAmount !== undefined && bal.xmxn !== undefined && bal.xmxn < quoteAmount;
  const done = bill.stage === "done" && bill.result;

  const change = (fn: () => void) => {
    fn();
    if (bill.quote) bill.reset(); // editing a paid field drops the quote and its idempotency key (R-015)
  };

  return (
    <div className="flex min-h-full flex-col">
      <Header
        title={airtime ? "Recargar Tiempo Aire" : "Pagar servicios"}
        sub={airtime ? "Telcel airtime top-up" : "CFE electricity bill"}
        onBack={inFlight ? undefined : () => (bill.reset(), s.setScreen("inicio"))}
      />
      <div className="grid gap-3 px-4 pb-4">
        <p className="rounded-[10px] border border-transparent bg-[#f4f5f7] px-3 py-2 text-xs text-[#5b6270]">
          SIMULADO · SIMULATED: el pago es real en Tempo; {airtime ? "la recarga" : "el pago al proveedor"} no se entrega · the payment is real, the{" "}
          {airtime ? "top-up" : "bill payment"} is not delivered.
        </p>
        {done ? (
          <PaidReceipt s={s} />
        ) : (
          <>
            <label className="grid gap-1">
              <span className="text-xs text-[#5b6270]">{airtime ? "Número Telcel · phone (10 dígitos)" : "Número de servicio CFE · service number (12 dígitos)"}</span>
              <div className="flex items-center gap-2 rounded-[10px] border border-[#e6e8ec] bg-white px-3">
                {airtime ? <Phone className="size-4 text-[#5b6270]" /> : <Lightbulb className="size-4 text-[#5b6270]" />}
                <input
                  inputMode="numeric"
                  value={airtime ? phone : service}
                  disabled={inFlight}
                  onChange={(e) => change(() => (airtime ? setPhone : setService)(e.target.value.replace(/\D/g, "").slice(0, airtime ? 10 : 12)))}
                  placeholder={airtime ? "55 1234 5678" : "123456789012"}
                  className="h-11 flex-1 bg-transparent text-[16px] tabular outline-none"
                />
              </div>
            </label>
            <div>
              <p className="mb-1 text-xs text-[#5b6270]">Monto · amount (MXN)</p>
              <div className="grid grid-cols-3 gap-2">
                {amounts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={inFlight}
                    onClick={() => change(() => setMxn(a))}
                    className={cn("h-11 rounded-[10px] border text-[15px] font-semibold tabular", mxn === a ? "border-[#111418] bg-[#111418] text-[#ffffff]" : "border-[#e6e8ec] bg-white")}
                  >
                    ${a}
                  </button>
                ))}
              </div>
            </div>
            {bill.quote ? (
              <div className="rounded-[12px] bg-[#f4f5f7] p-3 text-sm">
                <p className="text-xs text-[#5b6270]">{bill.quote.description}</p>
                <p className="mt-1 text-xl font-semibold tabular">{fmtAmount(BigInt(bill.quote.amount))} xMXN</p>
                <p className="text-xs text-[#5b6270]">Tu saldo · balance: {bal.xmxn === undefined ? "—" : fmtAmount(bal.xmxn)} xMXN</p>
                {short && (
                  <div className="mt-2 grid gap-1.5">
                    <p className="text-xs text-[#5b6270]">Necesitas pesos para pagar · You need xMXN to pay this bill.</p>
                    <button
                      type="button"
                      disabled={s.send.tx.isBusy || !address}
                      onClick={() => address && quoteAmount !== undefined && s.send.convert(quoteAmount - (bal.xmxn ?? 0n), address).catch(() => undefined)}
                      className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#111418] text-sm font-semibold text-[#ffffff] disabled:opacity-40"
                    >
                      {s.send.tx.isBusy ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> {s.send.tx.stepLabel ?? "Convirtiendo"}…
                        </>
                      ) : (
                        "Convertir dólares a pesos · Convert"
                      )}
                    </button>
                    {s.send.tx.status === "error" && s.send.tx.error && <p className="text-xs text-[#d92d20]">{s.send.tx.error}</p>}
                  </div>
                )}
              </div>
            ) : null}
            {bill.error && <p className="text-xs text-[#d92d20]">{bill.error}</p>}
            {!bill.quote ? (
              <button
                type="button"
                disabled={!valid || inFlight}
                onClick={() => bill.requestQuote(airtime ? { provider: "telcel", phone, amountMxn: mxn } : { provider: "cfe", serviceNumber: service, amountMxn: mxn })}
                className="h-12 rounded-[12px] text-[16px] font-semibold disabled:opacity-40"
                style={{ background: ACCENT, color: "#ffffff" }}
              >
                {bill.stage === "quoting" ? "Cotizando… · Quoting" : "Cotizar · Get quote"}
              </button>
            ) : (
              <button
                type="button"
                disabled={!bill.canPay || inFlight || short}
                onClick={() => bill.pay()}
                className="flex h-12 items-center justify-center gap-2 rounded-[12px] text-[16px] font-semibold disabled:opacity-40"
                style={{ background: ACCENT, color: "#ffffff" }}
              >
                {inFlight ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> {STAGE_ES[bill.stage] ?? "Pagando"}…
                  </>
                ) : (
                  <>Pagar {fmtAmount(BigInt(bill.quote.amount))} xMXN · Pay</>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export const STAGE_ES: Record<string, string> = {
  requesting: "Pidiendo cobro · requesting",
  challenge: "402: pago requerido · payment required",
  signing: "Firmando pago · signing",
  verifying: "Verificando en Tempo · verifying",
};

function PaidReceipt({ s }: { s: RemesasState }) {
  const r = s.bill.result!;
  return (
    <div className="grid gap-3 text-center">
      <span className="mx-auto mt-2 grid size-14 place-items-center rounded-full text-white" style={{ background: ACCENT }}>
        <Check className="size-7" />
      </span>
      <p className="text-lg font-semibold">Pagado · Paid</p>
      <div className="grid gap-2 rounded-[12px] border border-[#e6e8ec] bg-white p-3 text-left text-sm">
        <div className="flex justify-between gap-2">
          <span>Pago · Payment</span>
          <span className="font-semibold tabular">{fmtAmount(BigInt(r.receipt.amount))} xMXN</span>
        </div>
        <a href={r.receipt.explorerUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 text-xs text-[#5b6270] hover:underline">
          <span>Real, on Tempo</span>
          <span className="inline-flex items-center gap-1 font-mono">
            {r.receipt.txHash.slice(0, 10)}… <ExternalLink className="size-3" />
          </span>
        </a>
        <div className="flex justify-between gap-2 border-t border-[#e6e8ec] pt-2">
          <span>{r.fulfillment?.providerName ?? "Proveedor"}</span>
          <span className="rounded bg-[#f4f5f7] px-1.5 text-xs font-semibold text-[#5b6270]">SIMULATED</span>
        </div>
        {r.fulfillment && <p className="font-mono text-xs text-[#5b6270]">Ref. {r.fulfillment.reference}</p>}
      </div>
      <button
        type="button"
        onClick={() => {
          s.bill.reset();
          s.setScreen("inicio");
        }}
        className="h-12 rounded-[12px] bg-[#111418] text-[16px] font-semibold text-[#ffffff]"
      >
        Listo · Done
      </button>
    </div>
  );
}
