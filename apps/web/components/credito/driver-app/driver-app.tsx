"use client";
// Mercado Crédito driver app (crew/DESIGN-ECOSYSTEM.md §5): inside the Android PhoneFrame on desktop,
// full-screen on phones, with a "what just happened" panel beside it. Spanish first, mobile kit (M3).
//   Connect a work platform (real logos; simulated consent sheet) → Demo earnings → credit line + why →
//   real draw on the CreditPool → Tu adelanto with real repay → shortcut to pay Tiempo Aire.
// Mocked and labeled: the platform connection/consent and the earnings data (Demo … Data).
// Real: the attestation signature, the borrow and the repayment on Tempo.
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { ExternalLink, Info, Smartphone, Star, Wallet } from "lucide-react";
import { useBalances } from "@/lib/contracts";
import { fmtAmount, fmtNumber, shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel, PhoneFrame, Row, Rows } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  Banner,
  BrandLogo,
  Button,
  Chip,
  ConsentSheet,
  DemoBadge,
  DetailRows,
  HonestyNote,
  LinearProgress,
  ListItem,
  PlatformButton,
  ScreenTransition,
  Skeleton,
  SuccessScreen,
  TopAppBar,
  fmtMoney,
  useNavDirection,
} from "@/components/mobile";
import { PLATFORMS, useAdvance, useDriverData, type Platform } from "./use-driver";

const PINK = "#f2357d";
type Screen = "conectar" | "ingresos" | "recibido" | "adelanto";
const ORDER: Screen[] = ["conectar", "ingresos", "recibido", "adelanto"];
const SCOPES = [
  { es: "Perfil", en: "Profile: name, city, rating" },
  { es: "Viajes", en: "Trips: how many and when" },
  { es: "Ganancias", en: "Earnings: weekly payouts" },
];

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
  const [asking, setAsking] = useState<Platform>();
  const data = useDriverData(screen === "conectar" ? undefined : platform);
  const adv = useAdvance(address, platform);
  const debt = adv.pool.debt;
  const dir = useNavDirection(screen, ORDER);

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

  const props = { screen, setScreen, platform, setPlatform, data, adv, ask: setAsking };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10">
      <div className="-mx-4 sm:mx-0">
        <PhoneFrame label="Driver app, Android phone preview" accent={PINK}>
          <ScreenTransition id={screen} dir={dir}>
            {screen === "conectar" && <Conectar {...props} />}
            {screen === "ingresos" && <Ingresos {...props} />}
            {screen === "recibido" && <Recibido {...props} />}
            {screen === "adelanto" && <Adelanto {...props} />}
          </ScreenTransition>
          <ConsentSheet
            open={!!asking}
            platform={asking}
            app="Mercado Crédito"
            scopes={SCOPES}
            onCancel={() => setAsking(undefined)}
            onAllow={() => {
              if (!asking) return;
              setPlatform(asking);
              if (address) adv.score.mutate({ borrower: address, platform: asking });
              setAsking(undefined);
              setScreen("ingresos");
            }}
          />
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
  ask: (p: Platform) => void;
};

/* ─────────────────────────────── Conectar ─────────────────────────────── */

function Conectar({ ask }: Props) {
  const { address } = useConnection();
  return (
    <div className="flex min-h-full flex-col px-5 pb-6">
      <div className="pt-8">
        <span className="grid size-12 place-items-center rounded-[14px] text-[20px] font-semibold text-white" style={{ background: PINK }} aria-hidden>
          M
        </span>
        <p className="mt-5 text-[28px] leading-[1.15] tracking-[-0.01em]">Obtén un adelanto de lo que ya ganaste</p>
        <p className="mt-2 text-[15px] text-[var(--m-on-surface-variant)]">Get an advance on what you&apos;ve already earned. Connect the app you drive or deliver with.</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <DemoBadge tone="accent">Sin buró · no credit bureau</DemoBadge>
        <DemoBadge tone="accent">Comisión fija 2%</DemoBadge>
      </div>
      <div className="mt-auto grid gap-3 pt-8">
        {PLATFORMS.map((p) => (
          <PlatformButton key={p.id} id={p.id} disabled={!address} onClick={() => ask(p.id)} />
        ))}
        <p className="mt-1 text-center text-[13px] leading-snug text-[var(--m-on-surface-variant)]">
          Demo connection: simulated consent, not affiliated with Uber, DiDi or Rappi. We never ask for your password.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Ingresos ─────────────────────────────── */

function EarningsChart({ weeks }: { weeks: { weekStart: string; netMxn: number }[] }) {
  const max = Math.max(...weeks.map((w) => w.netMxn), 1);
  const sorted = [...weeks.map((w) => w.netMxn)].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const last = weeks.length - 1;
  return (
    <figure className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <p className="m-num text-[32px] leading-none">{fmtMoney(median, 0)}</p>
        <p className="text-[13px] text-[var(--m-on-surface-variant)]">mediana por semana · MXN</p>
      </div>
      <div className="relative flex h-28 items-end gap-[3px]" aria-label="Ganancias netas por semana, MXN">
        {weeks.map((w, i) => (
          <span
            key={w.weekStart}
            className="m-rise flex-1 rounded-t-[4px]"
            style={{ height: `${(w.netMxn / max) * 100}%`, background: PINK, opacity: i === last ? 1 : 0.55, animationDelay: `${i * 18}ms` }}
            title={`${w.weekStart}: ${fmtNumber(w.netMxn, 0)} MXN`}
          />
        ))}
        <span className="absolute inset-x-0 border-t border-dashed border-[#15171b]/40" style={{ bottom: `${(median / max) * 100}%` }} aria-hidden />
      </div>
      <figcaption className="flex justify-between text-[13px] text-[var(--m-on-surface-variant)]">
        <span>hace {weeks.length} semanas</span>
        <span>esta semana</span>
      </figcaption>
    </figure>
  );
}

function Ingresos({ data, adv, setScreen, platform }: Props) {
  const d = data.data;
  const s = adv.score.data;
  const [pct, setPct] = useState(100);
  const available = adv.available;
  const amount = available !== undefined ? (available * BigInt(pct)) / 100n : 0n;
  const busy = adv.tx.isBusy;

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar
        title="Tus ganancias"
        sub="Your earnings"
        onBack={busy ? undefined : () => setScreen("conectar")}
        actions={platform && <span className="mr-3 grid h-9 place-items-center rounded-full border border-[var(--m-outline-variant)] bg-white px-3"><BrandLogo id={platform} height={platform === "rappi" ? 16 : 12} /></span>}
      />
      {(busy || adv.score.isPending) && <LinearProgress className="rounded-none" />}
      <div className="grid gap-5 px-4 pt-1 pb-5">
        {data.isLoading || !d ? (
          <div className="grid gap-3" aria-busy="true">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-28 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={d.driver.firstName} />
              <div className="min-w-0 flex-1">
                <p className="text-[16px]">
                  {d.driver.firstName} · {d.driver.city}
                </p>
                <p className="flex items-center gap-1 text-[13px] text-[var(--m-on-surface-variant)]">
                  <Star className="size-3.5 fill-current" /> {fmtNumber(d.driver.rating, 2)} · {d.driver.vehicle}
                </p>
              </div>
              <DemoBadge>{d.label}</DemoBadge>
            </div>
            <EarningsChart weeks={d.weeks} />
          </>
        )}

        {adv.score.isPending && (
          <div className="grid gap-2 rounded-[24px] bg-[var(--m-surface-1)] p-5" aria-busy="true">
            <p className="text-[14px] text-[var(--m-on-surface-variant)]">Calculando tu línea · scoring…</p>
            <Skeleton className="h-9 w-44" />
          </div>
        )}
        {adv.score.error && <Banner tone="error">{(adv.score.error as Error).message}</Banner>}
        {s && (
          <section className="relative overflow-hidden rounded-[28px] p-5 text-white" style={{ background: s.eligible ? PINK : "#5b6270" }}>
            <span aria-hidden className="absolute -top-14 -right-10 size-44 rounded-full bg-white/10" />
            <span aria-hidden className="absolute -right-16 -bottom-20 size-48 rounded-full bg-black/10" />
            <div className="relative">
              <p className="text-[14px] text-white/90">Tu línea de crédito · your credit line</p>
              <p className="m-num mt-1 text-[40px] leading-none font-medium">{s.eligible ? `${fmtAmount(BigInt(s.maxAmount), 0)} xMXN` : "No disponible"}</p>
              <ul className="mt-3 grid gap-1 text-[13px] text-white/90">
                {s.explanation.slice(0, 3).map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            </div>
          </section>
        )}
        {s?.attestationWithheld && <Banner tone="error">{s.attestationWithheld}</Banner>}

        {adv.att && !adv.expired && (
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[14px] text-[var(--m-on-surface-variant)]">¿Cuánto quieres? · drawable now</p>
              <span className="m-num rounded-full bg-[var(--m-surface-2)] px-2.5 py-1 text-[13px] text-[var(--m-on-surface-variant)]">vence en {adv.secondsLeft ?? "…"}s</span>
            </div>
            <div className="flex gap-2">
              {[25, 50, 100].map((p) => (
                <Chip key={p} selected={pct === p} disabled={busy} onClick={() => setPct(p)}>
                  {p === 100 ? "Todo" : `${p}%`}
                </Chip>
              ))}
            </div>
            <Button
              loading={busy}
              disabled={busy || amount === 0n}
              onClick={async () => {
                const steps = await adv.draw(amount);
                if (steps) setScreen("recibido");
              }}
            >
              {busy ? `${adv.tx.stepLabel ?? "Enviando"}…` : `Recibir ${fmtAmount(amount)} xMXN`}
            </Button>
            <p className="text-[13px] leading-[1.4] text-[var(--m-on-surface-variant)]">
              Comisión fija del 2% · flat 2% fee added to what you owe. Repay whenever you can; nothing is taken from your payouts.
            </p>
            {adv.tx.status === "error" && adv.tx.error && <Banner tone="error">{adv.tx.error}</Banner>}
          </div>
        )}
        {adv.att && adv.expired && (
          <Button variant="outlined" onClick={adv.check}>
            La oferta venció · Refresh the offer
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Recibido ─────────────────────────────── */

function Recibido({ adv, setScreen }: Props) {
  const last = adv.tx.steps.at(-1);
  return (
    <SuccessScreen
      title="¡Listo! Ya tienes tu adelanto"
      amount={`${fmtAmount(adv.pool.loanPrincipal)} xMXN`}
      caption="en tu wallet, on-chain · in your wallet now"
      action={
        <Button variant="dark" className="w-full" onClick={() => setScreen("adelanto")}>
          Ver mi adelanto
        </Button>
      }
    >
      <DetailRows
        rows={[
          { label: "Debes", value: `${fmtAmount(adv.pool.debt)} xMXN`, sub: "incluye la comisión del 2%" },
          {
            label: "Comprobante",
            value: last ? (
              <a href={last.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono" style={{ color: "#b0124f" }}>
                {last.hash.slice(0, 10)}… <ExternalLink className="size-3.5" />
              </a>
            ) : (
              "—"
            ),
            sub: "Tempo testnet",
          },
        ]}
      />
    </SuccessScreen>
  );
}

/* ─────────────────────────────── Adelanto ─────────────────────────────── */

function Adelanto({ adv, setScreen }: Props) {
  const bal = useBalances();
  const debt = adv.pool.debt;
  const busy = adv.tx.isBusy;
  const canRepay = debt !== undefined && debt > 0n && bal.xmxn !== undefined;
  const repayAmount = canRepay ? (bal.xmxn! < debt! ? bal.xmxn! : debt!) : 0n;
  const owed = adv.pool.loanPrincipal !== undefined && adv.pool.loanFee !== undefined ? adv.pool.loanPrincipal + adv.pool.loanFee : undefined;
  const paidPct = owed && debt !== undefined && owed > 0n ? Math.max(0, Math.min(100, Number(((owed - debt) * 100n) / owed))) : 0;
  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar title="Tu adelanto" sub="Your advance" onBack={busy ? undefined : () => setScreen("conectar")} />
      {busy && <LinearProgress className="rounded-none" />}
      <div className="grid gap-4 px-4 pt-1 pb-5">
        <section className="relative overflow-hidden rounded-[28px] p-5 text-white" style={{ background: PINK }}>
          <span aria-hidden className="absolute -top-14 -right-10 size-44 rounded-full bg-white/10" />
          <div className="relative">
            <p className="text-[14px] text-white/90">Debes · You owe</p>
            <p className="m-num mt-1 text-[40px] leading-none font-medium">{debt === undefined ? "—" : fmtAmount(debt)}</p>
            <p className="text-[13px] text-white/85">xMXN, incluye la comisión del 2%</p>
            {debt !== undefined && debt > 0n && (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${paidPct}%` }} />
                </div>
                <p className="mt-1.5 text-[13px] text-white/85">{paidPct}% pagado</p>
              </div>
            )}
          </div>
        </section>
        <DetailRows
          rows={[
            { label: "Recibiste · borrowed", value: `${fmtAmount(adv.pool.loanPrincipal)} xMXN` },
            { label: "Comisión · fee", value: `${fmtAmount(adv.pool.loanFee)} xMXN` },
            { label: "Tu saldo · balance", value: `${fmtAmount(bal.xmxn)} xMXN` },
          ]}
        />
        {debt !== undefined && debt > 0n ? (
          <Button variant="dark" loading={busy} disabled={busy || repayAmount === 0n} onClick={() => adv.repay(repayAmount)}>
            {busy ? `${adv.tx.stepLabel ?? "Pagando"}…` : repayAmount < debt ? `Pagar ${fmtAmount(repayAmount)} de ${fmtAmount(debt)}` : `Pagar todo · ${fmtAmount(debt)} xMXN`}
          </Button>
        ) : (
          <Banner tone="success" icon={<Wallet />}>
            No debes nada · Nothing owed
          </Banner>
        )}
        {adv.tx.status === "error" && adv.tx.error && <Banner tone="error">{adv.tx.error}</Banner>}
        <div className="-mx-4">
          <ListItem
            href="/remesas?screen=aire"
            leading={
              <span className="grid size-10 place-items-center rounded-full bg-[#ff8a1f] text-white">
                <Smartphone className="size-5" strokeWidth={1.75} />
              </span>
            }
            headline="Recargar Tiempo Aire"
            supporting="Top up your phone in Mercado Remesas"
          />
        </div>
        <p className={cn("flex items-start gap-2 text-[13px] text-[var(--m-on-surface-variant)]")}>
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          Pagas cuando quieras. Nada se descuenta de tus pagos de la plataforma · Repayment is manual.
        </p>
      </div>
      <HonestyNote className="mt-auto pb-4">xMXN es un token demo en Tempo testnet. Datos de ganancias: demo, sintéticos.</HonestyNote>
    </div>
  );
}

function WhatHappened({ screen, platform, data, adv }: Props) {
  const { address } = useConnection();
  const name = PLATFORMS.find((p) => p.id === platform)?.name;
  const s = adv.score.data;
  const steps = [
    {
      done: !!platform && screen !== "conectar",
      label: `Connected ${name ?? "a work platform"}`,
      sub: "Simulated consent; nothing is read from a real account",
      badge: "Demo",
    },
    {
      done: !!data.data,
      label: data.data ? `Loaded ${data.data.label}` : "Load demo earnings",
      sub: data.data
        ? `${data.data.weeks.length} weeks of synthetic payouts, kept off-chain`
        : "Synthetic fixtures",
      badge: "Demo",
    },
    {
      done: !!s,
      label: s ? `Scored ${fmtNumber(s.score, 1)} / 100` : "Score the earnings",
      sub: s
        ? `Floor ${s.scoreFloor}; credit line capped by ${s.capReason === "absolute-cap" ? "the 1,500 xMXN ceiling" : s.capReason === "income-share" ? "15% of median weekly earnings" : "eligibility"}`
        : "Illustrative rule, not a credit model",
    },
    {
      done: !!adv.att,
      label: "Signed an eligibility attestation",
      sub: adv.att
        ? `EIP-712 by ${shortAddr(adv.att.signer)} for ${shortAddr(adv.att.borrower)}, expires in ${adv.secondsLeft ?? "…"}s, single-use nonce`
        : "Bound to this wallet, this pool and this chain",
    },
  ];
  return (
    <div className="grid content-start gap-8">
      <Panel
        title="What just happened"
        description="Each step of the advance, and what is real."
      >
        <ol className="grid gap-3">
          {steps.map((st) => (
            <li key={st.label} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-1.5 size-2.5 shrink-0 rounded-full",
                  st.done ? "bg-product" : "bg-input",
                )}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-[15px]",
                    !st.done && "text-muted-foreground",
                  )}
                >
                  {st.label}
                </p>
                <p className="text-muted-foreground text-[13px]">{st.sub}</p>
              </div>
              {st.badge && <Badge variant="mock">{st.badge}</Badge>}
            </li>
          ))}
          {adv.tx.steps.map((st) => (
            <li key={st.hash} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-1.5 size-2.5 shrink-0 rounded-full",
                  st.receipt ? "bg-success" : "bg-warning",
                )}
              />
              <a
                href={st.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
              >
                <span className="text-[15px]">{st.label}</span>
                <span className="text-muted-foreground font-mono text-[13px]">
                  {st.hash.slice(0, 10)}…
                </span>
                <ExternalLink className="text-muted-foreground size-3.5" />
              </a>
              <Badge variant="success">On-chain</Badge>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel
        title="The pool behind it"
        description="Advances come from lenders' xMXN in the credit pool, never from the mint vault."
      >
        <Rows>
          <Row
            label="Available to lend"
            value={
              adv.pool.available === undefined
                ? "—"
                : `${fmtAmount(adv.pool.available, 0)} xMXN`
            }
          />
          <Row
            label="Lent out"
            value={
              adv.pool.outstanding === undefined
                ? "—"
                : `${fmtAmount(adv.pool.outstanding, 0)} xMXN`
            }
          />
          <Row
            label="Your debt"
            sub={address ? shortAddr(address) : undefined}
            value={
              adv.pool.debt === undefined
                ? "—"
                : `${fmtAmount(adv.pool.debt)} xMXN`
            }
          />
          <Row
            label="Fees paid to lenders"
            sub="Realized only when advances are repaid"
            value={
              adv.pool.realizedFees === undefined
                ? "—"
                : `${fmtAmount(adv.pool.realizedFees)} xMXN`
            }
          />
        </Rows>
      </Panel>
    </div>
  );
}
