"use client";
// Mercado Crédito driver app (crew/DESIGN-ECOSYSTEM.md §5): inside the Android PhoneFrame on desktop,
// full-screen on phones, with a "what just happened" panel beside it. Spanish first.
//   Connect a work platform (simulated consent) → Demo earnings → credit line + why → real draw on the
//   CreditPool → Tu adelanto with real repay → shortcut to pay Tiempo Aire.
// Mocked and labeled: the platform connection/consent and the earnings data (Demo … Data).
// Real: the attestation signature, the borrow and the repayment on Tempo.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { ArrowLeft, Bike, Car, Check, ExternalLink, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { useBalances } from "@/lib/contracts";
import { fmtAmount, fmtNumber, shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel, PhoneFrame, Row, Rows } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { Badge } from "@/components/ui/badge";
import { PLATFORMS, useAdvance, useDriverData, type Platform } from "./use-driver";

const PINK = "#f2357d";
type Screen = "conectar" | "consent" | "ingresos" | "adelanto";

export function DriverApp() {
  return (
    <ConnectGate persona="driver" why="The driver app runs on the driver's wallet. Use the demo account or connect your own.">
      <DriverAppInner />
    </ConnectGate>
  );
}

function DriverAppInner() {
  const { address } = useConnection();
  const [screen, setScreen] = useState<Screen>("conectar");
  const [platform, setPlatform] = useState<Platform>();
  const data = useDriverData(screen === "conectar" || screen === "consent" ? undefined : platform);
  const adv = useAdvance(address, platform);
  const debt = adv.pool.debt;

  // Someone with an open advance lands on it.
  useEffect(() => {
    if (debt !== undefined && debt > 0n && screen === "conectar") setScreen("adelanto");
  }, [debt]); // eslint-disable-line react-hooks/exhaustive-deps
  // A different wallet means a different driver: start over (R-014).
  useEffect(() => {
    setScreen("conectar");
    setPlatform(undefined);
    adv.score.reset();
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  const props = { screen, setScreen, platform, setPlatform, data, adv };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10">
      <div className="-mx-4 sm:mx-0">
        <PhoneFrame label="Driver app, Android phone preview">
          <div className="flex min-h-full flex-col bg-white text-[#111418]">
            {screen === "conectar" && <Conectar {...props} />}
            {screen === "consent" && <Consent {...props} />}
            {screen === "ingresos" && <Ingresos {...props} />}
            {screen === "adelanto" && <Adelanto {...props} />}
          </div>
        </PhoneFrame>
      </div>
      <WhatHappened {...props} />
    </div>
  );
}

type Props = {
  screen: Screen;
  setScreen: (s: Screen) => void;
  platform?: Platform;
  setPlatform: (p: Platform) => void;
  data: ReturnType<typeof useDriverData>;
  adv: ReturnType<typeof useAdvance>;
};

function Header({ title, sub, onBack }: { title: string; sub: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-2 pb-3">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Atrás / Back" className="grid size-9 place-items-center rounded-full hover:bg-[#f4f5f7]">
          <ArrowLeft className="size-5" strokeWidth={1.75} />
        </button>
      )}
      <div>
        <p className="text-[17px] leading-tight font-semibold">{title}</p>
        <p className="text-[13px] text-[#5b6270]">{sub}</p>
      </div>
    </div>
  );
}

function Conectar({ setScreen, setPlatform }: Props) {
  return (
    <div className="flex min-h-full flex-col px-4 pb-6">
      <div className="pt-6">
        <span className="grid size-12 place-items-center rounded-[14px] text-white" style={{ background: PINK }}>
          <Car className="size-6" strokeWidth={1.75} />
        </span>
        <p className="mt-4 text-[22px] leading-tight font-semibold">Obtén un adelanto de lo que ya ganaste</p>
        <p className="mt-1 text-[15px] text-[#5b6270]">Get an advance on what you&apos;ve already earned. Connect the app you drive or deliver with.</p>
      </div>
      <div className="mt-6 grid gap-2.5">
        {PLATFORMS.map((p) => {
          const Icon = p.id === "rappi" ? Bike : Car;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPlatform(p.id);
                setScreen("consent");
              }}
              className="flex h-14 items-center gap-3 rounded-[14px] border border-[#e6e8ec] bg-white px-4 text-left hover:border-[#111418]"
            >
              <Icon className="size-5 text-[#5b6270]" strokeWidth={1.75} aria-hidden />
              <span className="flex-1 text-[16px] font-semibold">Continuar con {p.name}</span>
              <span className="text-[13px] text-[#5b6270]">{p.kind.split(" · ")[0]}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-[13px] leading-snug text-[#5b6270]">
        Demo connection: simulated consent, not affiliated with Uber, DiDi or Rappi. We never ask for your password.
      </p>
    </div>
  );
}

function Consent({ platform, setScreen, adv }: Props) {
  const { address } = useConnection();
  const name = PLATFORMS.find((p) => p.id === platform)?.name ?? "";
  return (
    <div className="flex min-h-full flex-col">
      <Header title={`Conectar ${name}`} sub="Simulated consent screen" onBack={() => setScreen("conectar")} />
      <div className="grid gap-4 px-4">
        <span className="w-fit rounded-md bg-[#f4f5f7] px-2 py-0.5 text-[13px] font-medium text-[#5b6270]">Demo · simulated</span>
        <p className="text-[17px] font-semibold">Mercado Crédito quiere ver tu cuenta de {name}</p>
        <ul className="grid gap-2.5 text-[15px]">
          {[
            ["Perfil", "Profile: name, city, rating"],
            ["Viajes", "Trips: how many and when"],
            ["Ganancias", "Earnings: weekly payouts"],
          ].map(([es, en]) => (
            <li key={es} className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0" style={{ color: PINK }} strokeWidth={2} />
              <span>
                <span className="font-semibold">{es}</span> <span className="text-[#5b6270]">· {en}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="flex items-start gap-2 rounded-[12px] bg-[#f4f5f7] p-3 text-[13px] text-[#5b6270]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          Nunca te pedimos tu contraseña. Only an earnings summary is used; it stays off-chain. Not affiliated with {name}.
        </p>
      </div>
      <div className="mt-auto grid gap-2 px-4 pt-4 pb-4">
        <button
          type="button"
          disabled={!address || !platform}
          onClick={() => {
            if (address && platform) adv.score.mutate({ borrower: address, platform });
            setScreen("ingresos");
          }}
          className="h-12 rounded-[12px] text-[16px] font-semibold text-white disabled:opacity-40"
          style={{ background: PINK }}
        >
          Permitir · Allow (demo)
        </button>
        <button type="button" onClick={() => setScreen("conectar")} className="h-11 rounded-[12px] text-[15px] font-semibold text-[#5b6270]">
          Cancelar · Cancel
        </button>
      </div>
    </div>
  );
}

function EarningsChart({ weeks }: { weeks: { weekStart: string; netMxn: number }[] }) {
  const max = Math.max(...weeks.map((w) => w.netMxn), 1);
  const sorted = [...weeks.map((w) => w.netMxn)].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  return (
    <figure className="grid gap-1">
      <div className="relative flex h-24 items-end gap-1" aria-label="Weekly net earnings, MXN">
        {weeks.map((w) => (
          <span key={w.weekStart} className="flex-1 rounded-t-[3px]" style={{ height: `${(w.netMxn / max) * 100}%`, background: PINK, opacity: 0.85 }} title={`${w.weekStart}: ${fmtNumber(w.netMxn, 0)} MXN`} />
        ))}
        <span className="absolute inset-x-0 border-t border-dashed border-[#111418]/40" style={{ bottom: `${(median / max) * 100}%` }} aria-hidden />
      </div>
      <figcaption className="flex justify-between text-[13px] text-[#5b6270]">
        <span>{weeks.length} semanas · weeks</span>
        <span>mediana {fmtNumber(median, 0)} MXN/sem</span>
      </figcaption>
    </figure>
  );
}

function Ingresos({ data, adv, setScreen }: Props) {
  const d = data.data;
  const s = adv.score.data;
  const [pct, setPct] = useState(100);
  const available = adv.available;
  const amount = available !== undefined ? (available * BigInt(pct)) / 100n : 0n;
  const busy = adv.tx.isBusy;

  return (
    <div className="flex min-h-full flex-col">
      <Header title="Tus ganancias" sub="Your earnings" onBack={busy ? undefined : () => setScreen("conectar")} />
      <div className="grid gap-4 px-4 pb-4">
        {data.isLoading || !d ? (
          <p className="flex items-center gap-2 text-[15px] text-[#5b6270]">
            <Loader2 className="size-4 animate-spin" /> Cargando ganancias · loading…
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-semibold">
                {d.driver.firstName} · {d.driver.city}
              </p>
              <span className="rounded-md bg-[#f4f5f7] px-2 py-0.5 text-[13px] font-medium text-[#5b6270]">{d.label}</span>
            </div>
            <EarningsChart weeks={d.weeks} />
          </>
        )}

        {adv.score.isPending && (
          <p className="flex items-center gap-2 text-[15px] text-[#5b6270]">
            <Loader2 className="size-4 animate-spin" /> Calculando tu línea · scoring…
          </p>
        )}
        {adv.score.error && <p className="text-[13px] text-[#d92d20]">{(adv.score.error as Error).message}</p>}
        {s && (
          <div className="grid gap-3 rounded-[16px] bg-[#f4f5f7] p-4">
            <p className="text-[13px] text-[#5b6270]">Tu línea de crédito · your credit line</p>
            <p className="text-[2rem] leading-none font-semibold tabular" style={{ color: s.eligible ? PINK : undefined }}>
              {s.eligible ? `${fmtAmount(BigInt(s.maxAmount), 0)} xMXN` : "No disponible"}
            </p>
            <ul className="grid gap-1 text-[13px] text-[#5b6270]">
              {s.explanation.slice(0, 3).map((e) => (
                <li key={e}>· {e}</li>
              ))}
            </ul>
            {s.attestationWithheld && <p className="text-[13px] text-[#d92d20]">{s.attestationWithheld}</p>}
          </div>
        )}

        {adv.att && !adv.expired && (
          <div className="grid gap-2">
            <p className="flex justify-between text-[13px] text-[#5b6270]">
              <span>Disponible ahora · drawable now</span>
              <span className="tabular">oferta vence en {adv.secondsLeft ?? "…"}s</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[25, 50, 100].map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy}
                  onClick={() => setPct(p)}
                  className={cn("h-10 rounded-[10px] border text-[15px] font-semibold", pct === p ? "border-[#111418] bg-[#111418] text-white" : "border-[#e6e8ec] bg-white")}
                >
                  {p === 100 ? "Todo" : `${p}%`}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || amount === 0n}
              onClick={async () => {
                const steps = await adv.draw(amount);
                if (steps) setScreen("adelanto");
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-[12px] text-[16px] font-semibold text-white disabled:opacity-40"
              style={{ background: PINK }}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {adv.tx.stepLabel ?? "Enviando"}…
                </>
              ) : (
                <>Recibir {fmtAmount(amount)} xMXN · Get it</>
              )}
            </button>
            <p className="text-[13px] text-[#5b6270]">Comisión fija del 2% · flat 2% fee added to what you owe. Repay whenever you can; nothing is taken from your payouts.</p>
            {adv.tx.status === "error" && adv.tx.error && <p className="text-[13px] text-[#d92d20]">{adv.tx.error}</p>}
          </div>
        )}
        {adv.att && adv.expired && (
          <button type="button" onClick={adv.check} className="h-11 rounded-[12px] border border-[#e6e8ec] text-[15px] font-semibold">
            La oferta venció · Refresh the offer
          </button>
        )}
      </div>
    </div>
  );
}

function Adelanto({ adv, setScreen }: Props) {
  const bal = useBalances();
  const debt = adv.pool.debt;
  const busy = adv.tx.isBusy;
  const canRepay = debt !== undefined && debt > 0n && bal.xmxn !== undefined;
  const repayAmount = canRepay ? (bal.xmxn! < debt! ? bal.xmxn! : debt!) : 0n;
  return (
    <div className="flex min-h-full flex-col">
      <Header title="Tu adelanto" sub="Your advance" onBack={busy ? undefined : () => setScreen("conectar")} />
      <div className="grid gap-4 px-4 pb-4">
        <div className="rounded-[20px] p-4 text-white" style={{ background: PINK }}>
          <p className="text-[13px] opacity-85">Debes · You owe</p>
          <p className="mt-1 text-[2.4rem] leading-none font-semibold tabular">{debt === undefined ? "—" : `${fmtAmount(debt)}`}</p>
          <p className="text-[13px] opacity-85">xMXN, including the 2% fee</p>
        </div>
        <div className="grid gap-1 text-[15px]">
          <div className="flex justify-between border-b border-[#e6e8ec] py-2">
            <span>Recibiste · borrowed</span>
            <span className="font-semibold tabular">{fmtAmount(adv.pool.loanPrincipal)} xMXN</span>
          </div>
          <div className="flex justify-between border-b border-[#e6e8ec] py-2">
            <span>Comisión · fee</span>
            <span className="font-semibold tabular">{fmtAmount(adv.pool.loanFee)} xMXN</span>
          </div>
          <div className="flex justify-between py-2">
            <span>Tu saldo · balance</span>
            <span className="font-semibold tabular">{fmtAmount(bal.xmxn)} xMXN</span>
          </div>
        </div>
        {debt !== undefined && debt > 0n ? (
          <button
            type="button"
            disabled={busy || repayAmount === 0n}
            onClick={() => adv.repay(repayAmount)}
            className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[#111418] text-[16px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {adv.tx.stepLabel ?? "Pagando"}…
              </>
            ) : repayAmount < debt ? (
              <>Pagar {fmtAmount(repayAmount)} de {fmtAmount(debt)} · Repay part</>
            ) : (
              <>Pagar todo · Repay {fmtAmount(debt)}</>
            )}
          </button>
        ) : (
          <p className="flex items-center gap-2 rounded-[12px] bg-[#f4f5f7] p-3 text-[15px]">
            <Check className="size-4" style={{ color: PINK }} /> No debes nada · Nothing owed
          </p>
        )}
        {adv.tx.status === "error" && adv.tx.error && <p className="text-[13px] text-[#d92d20]">{adv.tx.error}</p>}
        <Link href="/remesas?screen=aire" className="flex items-center gap-3 rounded-[14px] border border-[#e6e8ec] p-3 hover:border-[#111418]">
          <span className="grid size-9 place-items-center rounded-[10px] bg-[#ff8a1f] text-white">
            <Smartphone className="size-5" strokeWidth={1.75} />
          </span>
          <span>
            <span className="block text-[15px] font-semibold">Recargar Tiempo Aire</span>
            <span className="block text-[13px] text-[#5b6270]">Top up your phone in Mercado Remesas</span>
          </span>
        </Link>
        <p className="text-[13px] text-[#5b6270]">Pagas cuando quieras. Nada se descuenta de tus pagos de la plataforma · Repayment is manual.</p>
      </div>
    </div>
  );
}

function WhatHappened({ screen, platform, data, adv }: Props) {
  const { address } = useConnection();
  const name = PLATFORMS.find((p) => p.id === platform)?.name;
  const s = adv.score.data;
  const steps = [
    { done: !!platform && screen !== "conectar", label: `Connected ${name ?? "a work platform"}`, sub: "Simulated consent; nothing is read from a real account", badge: "Demo" },
    { done: !!data.data, label: data.data ? `Loaded ${data.data.label}` : "Load demo earnings", sub: data.data ? `${data.data.weeks.length} weeks of synthetic payouts, kept off-chain` : "Synthetic fixtures", badge: "Demo" },
    {
      done: !!s,
      label: s ? `Scored ${fmtNumber(s.score, 1)} / 100` : "Score the earnings",
      sub: s ? `Floor ${s.scoreFloor}; credit line capped by ${s.capReason === "absolute-cap" ? "the 1,500 xMXN ceiling" : s.capReason === "income-share" ? "15% of median weekly earnings" : "eligibility"}` : "Illustrative rule, not a credit model",
    },
    {
      done: !!adv.att,
      label: "Signed an eligibility attestation",
      sub: adv.att ? `EIP-712 by ${shortAddr(adv.att.signer)} for ${shortAddr(adv.att.borrower)}, expires in ${adv.secondsLeft ?? "…"}s, single-use nonce` : "Bound to this wallet, this pool and this chain",
    },
  ];
  return (
    <div className="grid content-start gap-8">
      <Panel title="What just happened" description="Each step of the advance, and what is real.">
        <ol className="grid gap-3">
          {steps.map((st) => (
            <li key={st.label} className="flex items-start gap-3">
              <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", st.done ? "bg-product" : "bg-input")} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-[15px]", !st.done && "text-muted-foreground")}>{st.label}</p>
                <p className="text-muted-foreground text-[13px]">{st.sub}</p>
              </div>
              {st.badge && <Badge variant="mock">{st.badge}</Badge>}
            </li>
          ))}
          {adv.tx.steps.map((st) => (
            <li key={st.hash} className="flex items-start gap-3">
              <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", st.receipt ? "bg-success" : "bg-warning")} />
              <a href={st.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                <span className="text-[15px]">{st.label}</span>
                <span className="text-muted-foreground font-mono text-[13px]">{st.hash.slice(0, 10)}…</span>
                <ExternalLink className="text-muted-foreground size-3.5" />
              </a>
              <Badge variant="success">On-chain</Badge>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="The pool behind it" description="Advances come from lenders' xMXN in the credit pool, never from the mint vault.">
        <Rows>
          <Row label="Available to lend" value={adv.pool.available === undefined ? "—" : `${fmtAmount(adv.pool.available, 0)} xMXN`} />
          <Row label="Lent out" value={adv.pool.outstanding === undefined ? "—" : `${fmtAmount(adv.pool.outstanding, 0)} xMXN`} />
          <Row label="Your debt" sub={address ? shortAddr(address) : undefined} value={adv.pool.debt === undefined ? "—" : `${fmtAmount(adv.pool.debt)} xMXN`} />
          <Row label="Fees paid to lenders" sub="Realized only when advances are repaid" value={adv.pool.realizedFees === undefined ? "—" : `${fmtAmount(adv.pool.realizedFees)} xMXN`} />
        </Rows>
      </Panel>
    </div>
  );
}
