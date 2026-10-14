"use client";
// Mercado Crédito driver app (crew/DESIGN-ECOSYSTEM.md §5, restyled per crew/PRINCIPLES.md on the mobile.md v2
// fintech structure): white canvas, Archivo Black balance, tiny uppercase meta, black pills, hairlines.
//   Conectar (real logos, simulated consent sheet) → Inicio: one huge "Disponible ahora" / "Debes", round actions,
//   activity · Ganancias (demo earnings + why this line) · Actividad (real Borrowed/Repaid logs) · Perfil.
//   Draw and repay run in bottom sheets; both end on a success screen.
// Spanish only inside the phone; the English explanations live in the "What just happened" panel beside it.
// Mocked and labeled: the platform connection/consent and the earnings data (Demo … Data).
// Real: the attestation signature, the borrow, the repayment and the activity list (Tempo logs).
import { useEffect, useState, type ReactNode } from "react";
import { useConnection } from "wagmi";
import { ArrowDownLeft, ArrowUpRight, BarChart3, ExternalLink, HandCoins, Home, List, Smartphone, Star, User, Wallet } from "lucide-react";
import { useBalances } from "@/lib/contracts";
import { fmtAmount, fmtNumber, shortAddr } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { LetterReveal, Stagger, TickerText } from "@/lib/motion";
import { Panel, PhoneFrame, Row, Rows } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { Badge } from "@/components/ui/badge";
import { personaByAddress } from "@/components/wallet/personas";
import { AppHeader, BalanceHead, BottomNav, BottomSheet, BrandLogo, ConsentSheet, Meta, Money, PhonePanel, PlatformButton, ScreenTransition, Skeleton, SuccessScreen, brandName, fmtMoney, useNavDirection } from "@/components/mobile";
import {
  AccentField,
  ActionRow,
  BankRow,
  DayGroups,
  Display,
  EdApp,
  Pill,
  PillChip,
  RoundAction,
  SectionHead,
  SplitStats,
  Flag,
  hora,
  useH,
  LoadError,
  StaleLine,
  washStyle,
} from "@/components/mobile/extra/editorial";
import { PLATFORMS, useAdvance, useCreditHistory, useDriverData, type Platform } from "./use-driver";

const ROSA = "#D93A7A";
type Flow = "conectar" | "app" | "recibido" | "pagado";
type Tab = "inicio" | "ganancias" | "actividad" | "perfil";
type Sheet = "adelanto" | "pagar";
const FLOW: Flow[] = ["conectar", "app", "recibido", "pagado"];
const TABS: Tab[] = ["inicio", "ganancias", "actividad", "perfil"];
const SCOPES = [
  { es: "Perfil", en: "Nombre, ciudad y calificación" },
  { es: "Viajes", en: "Cuántos y cuándo" },
  { es: "Ganancias", en: "Tus pagos semanales" },
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
  const [flow, setFlow] = useState<Flow>("conectar");
  const [tab, setTab] = useState<Tab>("inicio");
  const [sheet, setSheet] = useState<Sheet>();
  const [platform, setPlatform] = useState<Platform>();
  const [asking, setAsking] = useState<Platform>();
  const [paid, setPaid] = useState<bigint>();
  const data = useDriverData(platform);
  const adv = useAdvance(address, platform);
  const debt = adv.pool.debt;
  const prev = useFlowDirection(flow);
  const key = flow === "app" ? `app-${tab}` : flow;
  const prevKey = usePrevKey(key);
  const tabDir = useNavDirection(tab, TABS);
  // tab ↔ tab: shared-axis slide along the nav order; flow steps: forward/back along FLOW
  const dir = prevKey?.startsWith("app-") && key.startsWith("app-") ? tabDir : prev && FLOW.indexOf(flow) < FLOW.indexOf(prev) ? "back" : "fwd";

  // Someone with an open advance lands straight on the app (Debes), even before reconnecting a platform.
  useEffect(() => {
    if (debt !== undefined && debt > 0n && flow === "conectar") setFlow("app");
  }, [debt]); // eslint-disable-line react-hooks/exhaustive-deps
  // A different wallet means a different driver: start over (R-014).
  useEffect(() => {
    setFlow("conectar");
    setTab("inicio");
    setSheet(undefined);
    setPlatform(undefined);
    adv.score.reset();
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  const props: Props = {
    flow,
    setFlow,
    tab,
    setTab,
    platform,
    data,
    adv,
    ask: setAsking,
    open: setSheet,
    paid,
    setPaid,
    disconnect: () => {
      setPlatform(undefined);
      adv.score.reset();
      setTab("inicio");
      setFlow(debt !== undefined && debt > 0n ? "app" : "conectar");
    },
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10">
      <div className="-mx-4 sm:mx-0">
        <PhoneFrame label="Driver app, Android phone preview" accent={ROSA} onAccent="#0a0a0a" statusBar={flow === "recibido" || flow === "pagado" ? undefined : ROSA}>
          <EdApp screen={key}>
            <ScreenTransition className="flex-1" id={key} dir={dir}>
              {flow === "conectar" && <Conectar {...props} />}
              {flow === "app" && <AppShell {...props} />}
              {flow === "recibido" && <Recibido {...props} />}
              {flow === "pagado" && <Pagado {...props} />}
            </ScreenTransition>
            {flow === "app" && <AppNav tab={tab} setTab={setTab} />}
          </EdApp>
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
              setTab("inicio");
              setFlow("app");
            }}
          />
          <AdelantoSheet {...props} openSheet={sheet === "adelanto"} close={() => setSheet(undefined)} />
          <PagarSheet {...props} openSheet={sheet === "pagar"} close={() => setSheet(undefined)} />
        </PhoneFrame>
      </div>
      <PhonePanel>
        <WhatHappened {...props} />
      </PhonePanel>
    </div>
  );
}

/** Previous distinct screen key (to tell a tab switch from a flow step). */
function usePrevKey(key: string) {
  const [hist, setHist] = useState<{ cur: string; prev?: string }>({ cur: key });
  if (hist.cur !== key) setHist({ cur: key, prev: hist.cur });
  return hist.cur === key ? hist.prev : hist.cur;
}

/** Previous flow step (for the slide direction). */
function useFlowDirection(flow: Flow) {
  const [hist, setHist] = useState<{ cur: Flow; prev?: Flow }>({ cur: flow });
  if (hist.cur !== flow) setHist({ cur: flow, prev: hist.cur });
  return hist.prev;
}

type Props = {
  flow: Flow;
  setFlow: (f: Flow) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  platform?: Platform;
  data: ReturnType<typeof useDriverData>;
  adv: ReturnType<typeof useAdvance>;
  ask: (p: Platform) => void;
  open: (s: Sheet) => void;
  paid?: bigint;
  setPaid: (v: bigint) => void;
  disconnect: () => void;
};

/** Spanish progress label for the in-phone button (the hook's step labels are English, for the desktop trail). */
const busyLabel = (status: string, fallback: string) =>
  status === "simulating" ? "Preparando…" : status === "signing" ? "Firmando…" : status === "pending" ? "Confirmando en Tempo…" : `${fallback}…`;
const mmss = (s: number | undefined) => (s === undefined ? "…" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const firstName = (d: Props["data"]["data"]) => d?.driver.firstName;

/* ─────────────────────────────── Conectar ─────────────────────────────── */

function Conectar({ ask }: Props) {
  const H = useH();
  const { address } = useConnection();
  return (
    <div className="flex flex-1 flex-col pb-6">
      {/* v5 rosa field: the headline reveals letter by letter, "ganaste." (image-in-type) rises after, then the meta */}
      <AccentField color={ROSA} className="px-5 pt-5 pb-6">
        <Meta mark="#0a0a0a" parts={["Mercado Crédito", H("Testnet · sin valor real"), H("No canjeable")]} />
        <Display as="h1" size={50} className="mt-8">
          <LetterReveal text="Adelanta" />
          <br />
          <LetterReveal text="lo que ya" />
          <br />
          {/* image-in-type: our own route texture in low-contrast cream, so the word reads clean on rosa even at the
              desktop 0.7 zoom (public/photos/ruta-cream.webp, art/make_ruta.py; cream on rosa 3.5:1, large type).
              Kit m-rise, not <Reveal>: the page's route group owns entrances and switches nested Reveals off. */}
          <span className="m-rise inline-block" style={{ animationDelay: "220ms" }}>
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundColor: "#F2E6C9", backgroundImage: "url(/photos/ruta-cream.webp)", backgroundSize: "auto 170%", backgroundPosition: "12% 80%", WebkitBackgroundClip: "text" }}
            >
              ganaste.
            </span>
          </span>
        </Display>
        <div className="m-rise" style={{ animationDelay: "320ms" }}>
          <Meta className="mt-5" parts={["Sin buró", "Comisión fija 2%", "Pagas cuando quieras"]} />
        </div>
      </AccentField>
      <div className="grid gap-3 px-5 pt-5" style={washStyle(ROSA)}>
        <p className="m-meta border-b border-[var(--m-on-surface)] pb-2 !text-[var(--m-on-surface)]">Conecta la app con la que trabajas</p>
        {PLATFORMS.map((p) => (
          <PlatformButton key={p.id} id={p.id} disabled={!address} onClick={() => ask(p.id)} />
        ))}
        <Meta className="mt-1 justify-center text-center">{[H("Demo · consentimiento simulado"), "Sin afiliación con Uber, DiDi ni Rappi", "Nunca pedimos tu contraseña"].filter(Boolean).join(" · ")}</Meta>
      </div>
    </div>
  );
}

/* ─────────────────────────────── App shell + tabs ─────────────────────────────── */

function AppShell(props: Props) {
  const { tab } = props;
  return (
    <div className="flex-1">
      {tab === "inicio" && <Inicio {...props} />}
      {tab === "ganancias" && <Ganancias {...props} />}
      {tab === "actividad" && <Actividad {...props} />}
      {tab === "perfil" && <Perfil {...props} />}
    </div>
  );
}

/** Outside ScreenTransition: its slide leaves a transform that would trap the nav's position:fixed on phones. */
function AppNav({ tab, setTab }: Pick<Props, "tab" | "setTab">) {
  return (
    <BottomNav
      value={tab}
      onChange={setTab}
      items={[
        { id: "inicio", label: "Inicio", icon: <Home strokeWidth={1.75} /> },
        { id: "ganancias", label: "Ganancias", icon: <BarChart3 strokeWidth={1.75} /> },
        { id: "actividad", label: "Actividad", icon: <List strokeWidth={1.75} /> },
        { id: "perfil", label: "Perfil", icon: <User strokeWidth={1.75} /> },
      ]}
    />
  );
}

/** Kit AppHeader (■ 04 · CRÉDITO); honesty sits beside the balance (BalanceHead) and in each screen's meta. */
function TopMeta({ platform, title }: { platform?: Platform; title?: string }) {
  return (
    <AppHeader
      index="04"
      product={title ? `Crédito · ${title}` : "Crédito"}
      right={
        platform && (
          <span className="grid h-7 shrink-0 place-items-center rounded-full border border-[var(--m-outline-variant)] bg-white px-2.5">
            <BrandLogo id={platform} height={platform === "rappi" ? 13 : 10} />
          </span>
        )
      }
    />
  );
}

function Inicio({ platform, data, adv, open, setTab, ask }: Props) {
  const H = useH();
  const bal = useBalances();
  const s = adv.score.data;
  const debt = adv.pool.debt;
  const owing = debt !== undefined && debt > 0n;
  const owed = adv.pool.loanPrincipal !== undefined && adv.pool.loanFee !== undefined ? adv.pool.loanPrincipal + adv.pool.loanFee : undefined;
  const paidPct = owing && owed && owed > 0n ? Math.max(0, Math.min(100, Number(((owed - debt!) * 100n) / owed))) : 0;
  const canDraw = !!adv.att && !adv.expired && (adv.available ?? 0n) > 0n;
  const { address } = useConnection();
  // Same person as the Card holder app ("Hola, Javier") before a platform is connected.
  const name = firstName(data.data) ?? (personaByAddress(address)?.id === "driver" ? "Javier" : undefined);

  return (
    <div className="pb-6">
      <AccentField color={ROSA} className="pb-6">
        <TopMeta platform={platform} />
        <p className="px-5 pt-6 text-[15px] font-medium">{name ? `Hola, ${name}` : "Hola"}</p>

        {/* the one big number (kit Money ticks to each new value) */}
        <section className="px-5 pt-2" aria-live="polite">
          {owing ? (
            <>
              <BalanceHead label="Debes" />
              <Money value={debt} currency="MXN" size={54} className="mt-3" />
              <div className="mt-4 h-[3px] bg-[var(--m-surface-3)]">
                <div className="h-full bg-[var(--m-on-surface)] transition-[width] duration-700" style={{ width: `${paidPct}%` }} />
              </div>
              <Meta className="mt-2" parts={["xMXN", H("No canjeable"), "Incluye comisión 2%", <TickerText key="pagado" text={`${paidPct}% pagado`} />]} />
            </>
          ) : !platform ? (
            <>
              <BalanceHead label="Disponible ahora" />
              <Money value={undefined} size={54} className="mt-3" />
              <Meta className="mt-2">{"Conecta tu plataforma para ver tu línea"}</Meta>
            </>
          ) : adv.score.isPending || (!s && !adv.score.error) ? (
            <>
              <BalanceHead label="Analizando tus ganancias…" />
              <Skeleton className="mt-3 h-[48px] w-56 rounded-[4px]" />
              <Skeleton className="mt-3 h-3 w-40 rounded-[2px]" />
            </>
          ) : adv.score.error ? (
            <>
              <BalanceHead label="Disponible ahora" />
              <Display size={36} className="mt-3">
                Sin conexión
              </Display>
              <button type="button" className="mt-3 text-[14px] font-semibold underline underline-offset-4" onClick={adv.check}>
                Reintentar
              </button>
            </>
          ) : s && !s.eligible ? (
            <>
              <BalanceHead label="Disponible ahora" />
              <Display size={40} className="mt-3">
                No disponible
              </Display>
              <Meta className="mt-2" parts={["Aún no cumples el mínimo", "Vuelve en unas semanas"]} />
            </>
          ) : (
            <>
              <BalanceHead label="Disponible ahora" />
              <Money value={adv.available} currency="MXN" size={54} className="mt-3" />
              <Meta
                className="mt-2"
                parts={[
                  "xMXN",
                  H("No canjeable"),
                  s && <TickerText key="linea" text={`Línea MX${fmtMoney(BigInt(s.maxAmount), 0)}`} />,
                  s?.attestationWithheld ? "Oferta no disponible ahora" : adv.att && (adv.expired ? "Oferta vencida" : `Oferta vence en ${mmss(adv.secondsLeft)}`),
                ]}
              />
            </>
          )}
        </section>
      </AccentField>

      <div style={washStyle(ROSA)}>
        {!owing && platform && adv.att && adv.expired && (
          <div className="px-5 pt-5">
            <Pill variant="line" onClick={adv.check} loading={adv.score.isPending}>
              Actualizar oferta
            </Pill>
          </div>
        )}

        <div className="px-4 pt-7">
          <ActionRow>
            <RoundAction primary icon={<HandCoins strokeWidth={1.75} />} label="Adelanto" onClick={() => open("adelanto")} disabled={!canDraw} />
            <RoundAction icon={<ArrowUpRight strokeWidth={1.75} />} label="Pagar" onClick={() => open("pagar")} disabled={!owing} />
            <RoundAction icon={<Smartphone strokeWidth={1.75} />} label="Tiempo Aire" href="/remesas?screen=aire" />
            <RoundAction icon={<BarChart3 strokeWidth={1.75} />} label="Ganancias" onClick={() => setTab("ganancias")} />
          </ActionRow>
        </div>

        <div className="px-5 pt-7">
          <SplitStats
            items={[
              { label: <><Flag code="mx" /> Tu saldo</>, value: <TickerText text={`MX${fmtMoney(bal.xmxn)}`} />, sub: "xMXN en tu wallet" },
              owing
                ? { label: "Disponible", value: <TickerText text={`MX${fmtMoney(adv.available ?? 0n)}`} />, sub: "para otro adelanto" }
                : { label: "Debes", value: <TickerText text={`MX${fmtMoney(debt ?? 0n)}`} />, sub: "sin adelantos abiertos" },
            ]}
          />
        </div>

        {!platform && (
          <div className="px-5 pt-6">
            <SectionHead>Conecta para otro adelanto</SectionHead>
            <div className="grid gap-2 pt-3">
              {PLATFORMS.map((p) => (
                <PlatformButton key={p.id} id={p.id} onClick={() => ask(p.id)} />
              ))}
            </div>
          </div>
        )}

        <div className="px-5 pt-7">
          <SectionHead
            action={
              <button type="button" className="text-[13px] font-semibold" onClick={() => setTab("actividad")}>
                Ver todo
              </button>
            }
          >
            Actividad
          </SectionHead>
          <ActivityList limit={3} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Ganancias ─────────────────────────────── */

function EarningsBars({ weeks, height = 112 }: { weeks: { weekStart: string; netMxn: number }[]; height?: number }) {
  const max = Math.max(...weeks.map((w) => w.netMxn), 1);
  const last = weeks.length - 1;
  return (
    <figure className="grid gap-2">
      <div className="flex items-end gap-[3px]" style={{ height }} aria-label="Ganancias netas por semana, MXN">
        {weeks.map((w, i) => (
          <span
            key={w.weekStart}
            className="m-rise flex-1"
            style={{ height: `${(w.netMxn / max) * 100}%`, background: i === last ? ROSA : "var(--m-on-surface)", animationDelay: `${i * 22}ms` }}
            title={`${w.weekStart}: ${fmtNumber(w.netMxn, 0)} MXN`}
          />
        ))}
      </div>
      <figcaption className="m-meta flex justify-between">
        <span>Hace {weeks.length} semanas</span>
        <span>Esta semana</span>
      </figcaption>
    </figure>
  );
}

function Ganancias({ platform, data, adv }: Props) {
  const H = useH();
  const d = data.data;
  const s = adv.score.data;
  const f = s?.features;
  const cv = f?.netEarningsCv;
  const why = f
    ? [
        { t: `Ganas ${fmtMoney(f.medianWeeklyNetMxn, 0)} por semana`, sub: `Mediana de ${f.weeksObserved} semanas` },
        { t: `Activo ${f.activeWeeks} de ${f.weeksObserved} semanas`, sub: `${fmtNumber(f.medianWeeklyTrips, 0)} viajes por semana` },
        { t: cv! < 0.15 ? "Ingreso muy estable" : cv! < 0.35 ? "Ingreso algo variable" : "Ingreso muy variable", sub: "Semana a semana" },
        s?.eligible
          ? {
              t: s.capReason === "absolute-cap" ? "Tu línea llega al tope de $1,500" : "Tu línea es 15% de tu semana típica",
              sub: `Línea de ${fmtMoney(BigInt(s.maxAmount), 0)} xMXN`,
            }
          : { t: "Aún no alcanzas el mínimo", sub: `Puntaje ${fmtNumber(s!.score, 0)} de ${s!.scoreFloor} necesarios` },
      ]
    : [];
  return (
    <div className="pb-6">
      <AccentField color={ROSA} className="pb-6">
        <TopMeta platform={platform} title="Ganancias" />
        {!platform ? (
          <div className="px-5 pt-2">
            <Display size={36}>Sin plataforma</Display>
            <Meta className="mt-3">{"Conecta Uber, DiDi o Rappi en Inicio"}</Meta>
          </div>
        ) : !d ? (
          <div className="px-5 pt-6" aria-busy="true">
            <Skeleton className="h-12 w-48 rounded-[4px]" />
          </div>
        ) : (
          <section className="px-5 pt-6">
            <p className="m-meta">Semana típica · neto</p>
            <Money value={f?.medianWeeklyNetMxn ?? median(d.weeks.map((w) => w.netMxn))} digits={0} currency="MXN" size={48} className="mt-2" />
            <Meta className="mt-2" parts={[d.label, `${d.weeks.length} semanas`, H("Datos sintéticos"), H("Testnet")]} />
          </section>
        )}
      </AccentField>
      {platform && !d && (
        <div className="px-5 pt-6" aria-busy="true">
          <Skeleton className="h-28 w-full rounded-[2px]" />
        </div>
      )}
      {platform && d && (
        <div style={washStyle(ROSA)}>
          <div className="px-5 pt-6">
            <EarningsBars weeks={d.weeks} />
          </div>
          <div className="flex items-center gap-3 px-5 pt-6">
            <span className="grid size-10 place-items-center rounded-full bg-[var(--m-on-surface)] text-[15px] font-semibold text-[var(--m-surface)]">{d.driver.firstName[0]}</span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">
                {d.driver.firstName} · {d.driver.city}
              </p>
              <p className="flex items-center gap-1 text-[13px] text-[var(--m-on-surface-variant)]">
                <Star className="size-3.5 fill-current" /> {fmtNumber(d.driver.rating, 2)} · {d.driver.vehicle}
              </p>
            </div>
          </div>
          <div className="px-5 pt-7">
            <SectionHead>Por qué esta línea</SectionHead>
            {!s ? (
              <div className="grid gap-2 pt-3">
                <Skeleton className="h-4 w-3/4 rounded-[2px]" />
                <Skeleton className="h-4 w-2/3 rounded-[2px]" />
              </div>
            ) : (
              <Stagger as="ol" className="grid">
                {why.map((w, i) => (
                  <li key={w.t} className="flex items-baseline gap-4 border-b border-[var(--m-outline-variant)] py-3">
                    <span className="m-display w-6 text-[15px] text-[var(--m-on-surface-variant)]">{String(i + 1).padStart(2, "0")}</span>
                    <span>
                      <span className="block text-[15px] font-medium">{w.t}</span>
                      <span className="block text-[13px] text-[var(--m-on-surface-variant)]">{w.sub}</span>
                    </span>
                  </li>
                ))}
              </Stagger>
            )}
            {s && (
              <Meta className="mt-3">
                <TickerText text={`Puntaje ${fmtNumber(s.score, 0)}/100`} />
                {[``, `Mínimo ${s.scoreFloor}`, H("Ilustrativo, no es un modelo de crédito")].filter((x) => x !== undefined).join(" · ")}
              </Meta>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/* ─────────────────────────────── Actividad ─────────────────────────────── */

function ActivityList({ limit }: { limit?: number }) {
  const { address } = useConnection();
  const now = useNow(60_000);
  const feed = useCreditHistory(address);
  const rows = (feed.data ?? []).slice(0, limit ?? 30);
  if (!feed.data && feed.isError) return <LoadError onRetry={() => feed.refetch()} busy={feed.isFetching} />;
  if (feed.isLoading)
    return (
      <div className="grid gap-3 pt-3" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-4 flex-1 rounded-[2px]" />
          </div>
        ))}
      </div>
    );
  if (!rows.length) return <p className="py-5 text-[14px] text-[var(--m-on-surface-variant)]">Sin movimientos todavía.</p>;
  return (
    <>
      {feed.isRefetchError && <StaleLine updatedAt={feed.dataUpdatedAt} now={now} onRetry={() => feed.refetch()} />}
    <DayGroups
      items={rows}
      ts={(r) => r.timestamp}
      now={now}
      render={(r) => {
        const drawn = r.event === "Borrowed";
        return (
          <BankRow
            key={`${r.txHash}-${r.logIndex}`}
            href={r.url}
            leading={
              <span className={cn("grid size-10 place-items-center rounded-full", drawn ? "text-white" : "border border-[var(--m-on-surface)]")} style={drawn ? { background: ROSA } : undefined}>
                {drawn ? <ArrowDownLeft strokeWidth={2} /> : <ArrowUpRight strokeWidth={2} />}
              </span>
            }
            title={drawn ? "Adelanto recibido" : "Pago de adelanto"}
            sub={[hora(r.timestamp), drawn && r.fee !== undefined ? `Comisión ${fmtMoney(r.fee)}` : "On-chain"].filter(Boolean).join(" · ")}
            amount={`${drawn ? "+" : "−"}${fmtMoney(r.amount)}`}
            amountSub="xMXN"
            positive={drawn}
          />
        );
      }}
    />
    </>
  );
}

function Actividad({ platform }: Props) {
  const H = useH();
  return (
    <div className="pb-6">
      <AccentField color={ROSA} className="pb-6">
        <TopMeta platform={platform} title="Actividad" />
        <div className="px-5 pt-6">
          <Display size={40}>Actividad</Display>
          <Meta className="mt-2" parts={["Adelantos y pagos", "On-chain · Tempo", H("Testnet · sin valor real")]} />
        </div>
      </AccentField>
      <div className="px-5 pt-3" style={washStyle(ROSA)}>
        <ActivityList />
      </div>
    </div>
  );
}

/* ─────────────────────────────── Perfil ─────────────────────────────── */

function Perfil({ platform, data, disconnect }: Props) {
  const H = useH();
  const { address } = useConnection();
  const d = data.data;
  const rows: { k: string; v: ReactNode }[] = [
    { k: "Plataforma", v: platform ? <BrandLogo id={platform} height={platform === "rappi" ? 15 : 12} /> : "Sin conectar" },
    { k: "Datos de ganancias", v: d?.label ?? "—" },
    { k: "Wallet", v: <span className="font-mono text-[13px]">{shortAddr(address)}</span> },
    { k: "Red", v: "Tempo testnet" },
  ];
  return (
    <div className="pb-6">
      <AccentField color={ROSA} className="pb-6">
        <TopMeta platform={platform} title="Perfil" />
        <div className="px-5 pt-6">
          <Display size={48} fit>{d?.driver.firstName ?? (personaByAddress(address)?.id === "driver" ? "Javier" : "Chofer")}</Display>
          {d && <Meta className="mt-2" parts={[d.driver.city, `★ ${fmtNumber(d.driver.rating, 2)}`, d.driver.vehicle]} />}
        </div>
      </AccentField>
      <div className="px-5 pt-6" style={washStyle(ROSA)}>
        <dl className="border-t border-[var(--m-on-surface)]">
          {rows.map((r) => (
            <div key={r.k} className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--m-outline-variant)]">
              <dt className="text-[14px] text-[var(--m-on-surface-variant)]">{r.k}</dt>
              <dd className="text-[15px] font-medium">{r.v}</dd>
            </div>
          ))}
        </dl>
        {platform && (
          <div className="pt-6">
            <Pill variant="line" onClick={disconnect}>
              Desconectar {brandName(platform)}
            </Pill>
          </div>
        )}
        <div data-honesty>
          <Meta className="mt-6">{"Consentimiento simulado · Sin afiliación con Uber, DiDi ni Rappi · Ganancias: datos demo sintéticos · xMXN: token demo sin valor real, no canjeable por pesos"}</Meta>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Sheets ─────────────────────────────── */

function SheetRows({ rows }: { rows: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="border-t border-[var(--m-on-surface)]">
      {rows.map((r) => (
        <div key={r.k} className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--m-outline-variant)]">
          <dt className="text-[14px] text-[var(--m-on-surface-variant)]">{r.k}</dt>
          <dd className="m-num text-[15px] font-semibold">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function AdelantoSheet({ adv, setFlow, openSheet, close }: Props & { openSheet: boolean; close: () => void }) {
  const H = useH();
  const [pct, setPct] = useState(100);
  const busy = adv.tx.isBusy;
  const available = adv.available ?? 0n;
  const amount = (available * BigInt(pct)) / 100n;
  const feeBps = adv.pool.feeBps;
  const fee = feeBps !== undefined ? (amount * feeBps) / 10_000n : undefined;
  useEffect(() => {
    if (openSheet) setPct(100);
  }, [openSheet]);
  return (
    <BottomSheet open={openSheet} onClose={close} dismissable={!busy} ariaLabel="Pedir adelanto">
      <div className="grid gap-5 px-6 pb-2">
        <Meta mark={ROSA} parts={["Adelanto", feeBps !== undefined ? `Comisión fija ${fmtNumber(Number(feeBps) / 100, 0)}%` : undefined, H("Testnet")]} />
        <div>
          <Money value={amount} currency="MXN" size={48} />
          <Meta className="mt-2" parts={["xMXN", H("Testnet · sin valor real")]} />
        </div>
        <div className="flex gap-2">
          {[25, 50, 100].map((p) => (
            <PillChip key={p} selected={pct === p} disabled={busy} onClick={() => setPct(p)}>
              {p === 100 ? "Todo" : `${p}%`}
            </PillChip>
          ))}
        </div>
        <SheetRows
          rows={[
            { k: "Comisión", v: fee === undefined ? "—" : `MX${fmtMoney(fee)}` },
            { k: "Total a pagar", v: fee === undefined ? "—" : `MX${fmtMoney(amount + fee)}` },
            { k: "La oferta vence en", v: mmss(adv.secondsLeft) },
          ]}
        />
        {adv.tx.status === "error" && adv.tx.error && (
          <p role="alert" className="text-[14px] font-medium text-[#b3261e]">
            {adv.tx.error}
          </p>
        )}
        <Pill
          loading={busy}
          disabled={busy || amount === 0n || !adv.att || adv.expired}
          onClick={async () => {
            const steps = await adv.draw(amount);
            if (steps) {
              close();
              setFlow("recibido");
            }
          }}
        >
          {busy ? busyLabel(adv.tx.status, "Enviando") : `Recibir ${fmtAmount(amount)} xMXN`}
        </Pill>
        <Meta className="justify-center" parts={["Pagas cuando quieras", "Nada se descuenta de tus pagos"]} />
      </div>
    </BottomSheet>
  );
}

function PagarSheet({ adv, setFlow, setPaid, openSheet, close }: Props & { openSheet: boolean; close: () => void }) {
  const H = useH();
  const bal = useBalances();
  const debt = adv.pool.debt ?? 0n;
  const busy = adv.tx.isBusy;
  const can = bal.xmxn !== undefined && debt > 0n;
  const amount = can ? (bal.xmxn! < debt ? bal.xmxn! : debt) : 0n;
  const partial = amount < debt;
  return (
    <BottomSheet open={openSheet} onClose={close} dismissable={!busy} ariaLabel="Pagar adelanto">
      <div className="grid gap-5 px-6 pb-2">
        <Meta mark={ROSA} parts={["Pagar adelanto", H("Testnet")]} />
        <div>
          <Money value={amount} currency="MXN" size={48} />
          <Meta className="mt-2" parts={["xMXN", H("Testnet · sin valor real")]} />
        </div>
        <SheetRows
          rows={[
            { k: "Debes", v: `MX${fmtMoney(debt)}` },
            { k: "Tu saldo", v: `MX${fmtMoney(bal.xmxn)}` },
            { k: "Te quedará por pagar", v: `MX${fmtMoney(debt - amount)}` },
          ]}
        />
        {partial && amount > 0n && <Meta parts={["Tu saldo no cubre todo", "Pagas lo que tienes"]} />}
        {adv.tx.status === "error" && adv.tx.error && (
          <p role="alert" className="text-[14px] font-medium text-[#b3261e]">
            {adv.tx.error}
          </p>
        )}
        <Pill
          loading={busy}
          disabled={busy || amount === 0n}
          onClick={async () => {
            const steps = await adv.repay(amount);
            if (steps) {
              setPaid(amount);
              close();
              setFlow("pagado");
            }
          }}
        >
          {busy ? busyLabel(adv.tx.status, "Pagando") : partial ? `Pagar ${fmtAmount(amount)} xMXN` : `Pagar todo · ${fmtAmount(amount)} xMXN`}
        </Pill>
      </div>
    </BottomSheet>
  );
}

/* ─────────────────────────────── Success screens ─────────────────────────────── */

function Receipt({ title, amount, rows, action, adv }: { title: string; amount: bigint | undefined; rows: { k: string; v: ReactNode }[]; action: ReactNode; adv: Props["adv"] }) {
  const H = useH();
  const last = adv.tx.steps.at(-1);
  // kit SuccessScreen is min-h-full; let it fill the flex column so the action sits low
  return (
    <div className="flex flex-1 flex-col [&>div]:flex-1">
    <SuccessScreen
      title={title}
      amount={amount !== undefined ? `MX${fmtMoney(amount)}` : undefined}
      caption={["xMXN", "Confirmado en Tempo", H("Testnet · sin valor real")].filter(Boolean).join(" · ")}
      action={action}
    >
      <SheetRows
        rows={[
          ...rows,
          {
            k: "Comprobante",
            v: last ? (
              <a href={last.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[13px] underline underline-offset-4">
                {last.hash.slice(0, 10)}… <ExternalLink className="size-3.5" />
              </a>
            ) : (
              "—"
            ),
          },
        ]}
      />
    </SuccessScreen>
    </div>
  );
}

function Recibido({ adv, setFlow, setTab }: Props) {
  return (
    <Receipt
      adv={adv}
      title="Listo. Ya es tuyo."
      amount={adv.pool.loanPrincipal}
      rows={[{ k: "Debes", v: `MX${fmtMoney(adv.pool.debt)} · incluye 2%` }]}
      action={
        <Pill
          onClick={() => {
            setTab("inicio");
            setFlow("app");
          }}
        >
          Ver mi adelanto
        </Pill>
      }
    />
  );
}

function Pagado({ adv, paid, setFlow, setTab }: Props) {
  return (
    <Receipt
      adv={adv}
      title={adv.pool.debt === 0n ? "Pagado. No debes nada." : "Pago recibido."}
      amount={paid}
      rows={[{ k: "Debes ahora", v: `MX${fmtMoney(adv.pool.debt)}` }]}
      action={
        <Pill
          onClick={() => {
            setTab("inicio");
            setFlow("app");
          }}
        >
          Volver al inicio
        </Pill>
      }
    />
  );
}

/* ─────────────────────────────── Desktop panel ─────────────────────────────── */

function WhatHappened({ flow, platform, data, adv }: Props) {
  const { address } = useConnection();
  const name = PLATFORMS.find((p) => p.id === platform)?.name;
  const s = adv.score.data;
  const steps = [
    {
      done: !!platform && flow !== "conectar",
      label: `Connected ${name ?? "a work platform"}`,
      sub: "Simulated consent; nothing is read from a real account. Not affiliated with Uber, DiDi or Rappi; the app never asks for a password.",
      badge: "Demo",
    },
    {
      done: !!data.data,
      label: data.data ? `Loaded ${data.data.label}` : "Load demo earnings",
      sub: data.data ? `${data.data.weeks.length} weeks of synthetic payouts, kept off-chain` : "Synthetic fixtures",
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
      {(s || adv.score.error) && (
        <Panel title="Why this credit line" description="The scoring rule's own explanation. Illustrative demo heuristic only, not a validated credit model.">
          {adv.score.error && <p className="text-destructive text-[14px]">{(adv.score.error as Error).message}</p>}
          {s && (
            <ul className="grid gap-1.5 text-[14px]">
              {s.explanation.map((e) => (
                <li key={e} className="text-muted-foreground">
                  · {e}
                </li>
              ))}
              {s.attestationWithheld && <li className="text-destructive">· No offer right now: {s.attestationWithheld}</li>}
            </ul>
          )}
        </Panel>
      )}
      <Panel title="The pool behind it" description="Advances come from lenders' xMXN in the credit pool, never from the mint vault. A flat fee is added to what the driver owes; repayment is manual and nothing is taken from platform payouts.">
        <Rows>
          <Row label="Available to lend" value={adv.pool.available === undefined ? "—" : `${fmtAmount(adv.pool.available, 0)} xMXN`} />
          <Row label="Lent out" value={adv.pool.outstanding === undefined ? "—" : `${fmtAmount(adv.pool.outstanding, 0)} xMXN`} />
          <Row label="Your debt" sub={address ? shortAddr(address) : undefined} value={adv.pool.debt === undefined ? "—" : `${fmtAmount(adv.pool.debt)} xMXN`} />
          <Row label="Fees paid to lenders" sub="Realized only when advances are repaid" value={adv.pool.realizedFees === undefined ? "—" : `${fmtAmount(adv.pool.realizedFees)} xMXN`} />
        </Rows>
        <p className="text-muted-foreground mt-3 text-[13px]">
          <Wallet className="mr-1 inline size-3.5" />
          xMXN is a demo token on Tempo testnet with no real value. Earnings are synthetic Demo Data.
        </p>
      </Panel>
    </div>
  );
}
