"use client";
// The Remesas Android app (inside PhoneFrame on desktop, full-screen on phones). Structure: crew/mobile.md v2
// (one big balance, currency blocks, round actions, bank-style lists, bottom nav). Style: crew/PRINCIPLES.md
// (Archivo Black display, tiny uppercase meta, ink + cream blocks, terracotta for the primary action).
// Spanish only in the phone; the English explanations live in the desktop "what just happened" panel.
// Every number is live: balances and quotes from chain, sends on the v2 exchange, bills through the real
// MPP 402 flow. Simulated (and labeled): the on-ramp card charge and the airtime/bill fulfillment.
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { ArrowUpRight, Bell, CircleUserRound, CreditCard, ExternalLink, History, House, Lightbulb, Phone, Plus, Send, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { MEMO_MAX_BYTES, memoByteLength, useBalances, useOracle } from "@/lib/contracts";
import { useActivityFeed, type ActivityRow } from "@/lib/contracts/activity";
import { fmtNumber, shortAddr, toUnits } from "@/lib/format";
import { Stagger, TickerText } from "@/lib/motion";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { CONTACTS, contactByAddress, type Contact } from "@/components/wallet/personas";
import { TELCEL_AMOUNTS, useRecentOrders, type RecentOrder } from "@/components/billpay/use-bill-pay";
import {
  AppHeader,
  Avatar,
  BalanceHead,
  Banner,
  BottomNav,
  BottomSheet,
  BrandLogo,
  BrandTile,
  Button,
  Chip,
  DemoBadge,
  DetailRows,
  Display,
  EmptyState,
  IconButton,
  LinearProgress,
  ListHeader,
  ListItem,
  Meta,
  Money,
  NumericKeypad,
  Pressable,
  RoundAction,
  ScreenTransition,
  SkeletonList,
  SuccessScreen,
  TopAppBar,
  fmtMoney,
  fmtTyping,
  haceTiempo,
  useNavDirection,
  useSnackbar,
  useStatusBar,
  type NavItem,
} from "@/components/mobile";
import { AccentField, washStyle } from "@/components/mobile/extra/editorial";
import { OnrampSheet } from "./onramp-sheet";
import { useFxHistory, type FxPoint } from "./use-fx-history";
import type { RemesasState } from "./remesas-screen";

export type Screen = "inicio" | "enviar" | "enviado" | "aire" | "servicios" | "actividad" | "perfil";
const ORDER: Screen[] = ["inicio", "actividad", "perfil", "enviar", "aire", "servicios", "enviado"];
const TABS: NavItem<"inicio" | "tarjeta" | "actividad" | "perfil">[] = [
  { id: "inicio", label: "Inicio", icon: <House /> },
  { id: "tarjeta", label: "Tarjeta", icon: <CreditCard />, href: "/card" },
  { id: "actividad", label: "Actividad", icon: <History /> },
  { id: "perfil", label: "Perfil", icon: <CircleUserRound /> },
];

/** Remesas terracotta (PRINCIPLES §2). Large type and blocks only: it fails AA for small text on white. */
export const TERRACOTTA = "#e2603f";
const CREAM = "#f2e6c9";
const INK = "#0a0a0a";
const contacts = CONTACTS.filter((c) => c.address);

export function PhoneApp({ s }: { s: RemesasState }) {
  const { screen } = s;
  const dir = useNavDirection(screen, ORDER);
  const [onramp, setOnramp] = useState(false);
  const tab = screen === "inicio" || screen === "actividad" || screen === "perfil";
  const app = { s, openOnramp: () => setOnramp(true) };
  return (
    <div className="flex min-h-full flex-col bg-[var(--m-surface)]">
      <ScreenTransition id={screen} dir={dir} className="flex-1">
        {screen === "inicio" && <Inicio {...app} />}
        {screen === "enviar" && <Enviar {...app} />}
        {screen === "enviado" && <Enviado {...app} />}
        {(screen === "aire" || screen === "servicios") && <Pagar s={s} kind={screen} />}
        {screen === "actividad" && <Actividad {...app} />}
        {screen === "perfil" && <Perfil {...app} />}
      </ScreenTransition>
      {tab && <BottomNav items={TABS} value={screen as "inicio"} onChange={(id) => id !== "tarjeta" && s.setScreen(id)} />}
      <BottomSheet open={onramp} onClose={() => setOnramp(false)} title="Agregar dólares" sub="Con tarjeta · cargo simulado">
        <OnrampSheet onDone={() => setOnramp(false)} />
      </BottomSheet>
    </div>
  );
}

type AppProps = { s: RemesasState; openOnramp: () => void };

/* ─────────────────────────────── Inicio ─────────────────────────────── */

/**
 * Our own generated art for the image-in-type hero: a papel picado-like cut pattern. v5: the hero sits on the
 * terracotta field, so the pattern is all dark (ink, jade, cobalt): the word reads as one solid dark shape
 * at desktop zoom, with the cut pattern visible up close.
 */
const PAPEL =
  'url("data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'><rect width='96' height='96' fill='${INK}'/><path d='M0 0h48L24 24z' fill='#1f3d2b'/><path d='M48 0h48L72 24z' fill='#24301f'/><path d='M0 48h48L24 72z' fill='#24301f'/><path d='M48 48h48L72 72z' fill='#1f3d2b'/><circle cx='24' cy='40' r='5' fill='#2448c8'/><circle cx='72' cy='88' r='5' fill='#2448c8'/><path d='M60 30l6 6-6 6-6-6z' fill='#3a1a12'/><path d='M12 78l6 6-6 6-6-6z' fill='#3a1a12'/></svg>`,
  ) +
  '")';

const cdmxTime = (now?: number) => (now ? new Date((now - 6 * 3600) * 1000).toISOString().slice(11, 16) : "--:--");

function Inicio({ s, openOnramp }: AppProps) {
  useStatusBar(TERRACOTTA);
  const now = useNow(30_000);
  const snack = useSnackbar();
  const fx = useOracle();
  const start = (c?: Contact) => {
    if (c?.address) s.setTo(c.address);
    s.setScreen("enviar");
  };
  // Card top-ups are paused (server flag): say so on the entry point itself (review #19). The sheet still
  // opens: "Agregar fondos con Tempo Wallet" works there. Same query (and cache) as useOnramp.
  const onramp = useQuery({
    queryKey: ["onramp-status"],
    queryFn: async () =>
      (await fetch("/api/onramp", { cache: "no-store" })).json() as Promise<{
        enabled: boolean;
      }>,
    staleTime: 30_000,
  });
  const papel: CSSProperties = {
    backgroundImage: PAPEL,
    backgroundSize: "48px 48px",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    animation: "m-papel 24s linear infinite",
  };
  return (
    <div className="pb-6">
      {/* v5 color world: the terracotta field holds the header, the hero and the balance (ink text, 5.6:1 AA);
          a soft wash carries it into the white canvas for the tiles, actions and contacts. */}
      <AccentField color={TERRACOTTA} className="pb-6">
        <AppHeader
          index="02"
          product="Remesas"
          right={
            <>
              <IconButton label="Notificaciones" onClick={() => snack("Sin notificaciones nuevas")}>
                <Bell className="size-[22px]" strokeWidth={1.75} />
              </IconButton>
              <Avatar name="Sender US" size={36}>
                S
              </Avatar>
            </>
          }
        />

        <div className="px-4">
          <Display as="h1" size={58} style={papel} className="pt-1">
            Envía
            <br />a casa
          </Display>
          <Meta className="mt-3">
            CDMX · {fmtNumber(fx.rate, 2)} MXN/USD · {cdmxTime(now)}
          </Meta>
        </div>

        <Balance />
      </AccentField>

      <div className="px-4 pt-5" style={washStyle(TERRACOTTA)}>
        <CurrencyTiles />
      </div>

      <div className="mt-6 grid grid-cols-4 px-2">
        <RoundAction icon={<Plus />} label="Agregar" onClick={openOnramp} badge={onramp.data && !onramp.data.enabled ? "Próximamente" : undefined} />
        <RoundAction icon={<Send />} label="Enviar" onClick={() => start()} primary />
        <RoundAction icon={<Smartphone />} label="Tiempo Aire" onClick={() => s.setScreen("aire")} />
        <RoundAction icon={<Lightbulb />} label="Servicios" onClick={() => s.setScreen("servicios")} />
      </div>

      <ListHeader>Envía a</ListHeader>
      <div className="m-scroll flex gap-1 overflow-x-auto px-2 pt-1">
        {contacts.map((c) => (
          <Pressable key={c.id} onClick={() => start(c)} className="grid w-[80px] shrink-0 justify-items-center gap-1.5 rounded-[8px] py-2">
            <Avatar name={c.name} size={56} />
            <span className="grid text-center leading-tight">
              <span className="text-[14px] font-semibold">{c.name}</span>
              <span className="text-[13px] text-[var(--m-on-surface-variant)]">{c.city}</span>
            </span>
          </Pressable>
        ))}
        <Pressable onClick={() => snack("Demo: contactos fijos")} className="grid w-[80px] shrink-0 justify-items-center gap-1.5 rounded-[8px] py-2">
          <span className="grid size-14 place-items-center rounded-full border border-dashed border-[var(--m-outline)]">
            <Plus className="size-6" strokeWidth={1.75} />
          </span>
          <span className="text-[14px] font-semibold">Nuevo</span>
        </Pressable>
      </div>

      <ListHeader
        action={
          <button type="button" onClick={() => s.setScreen("actividad")} className="m-meta h-8 text-[var(--m-on-surface)] underline underline-offset-4">
            Ver todo
          </button>
        }
      >
        Movimientos
      </ListHeader>
      <ActivityList limit={4} onEmpty={() => start()} />
    </div>
  );
}

function Balance() {
  const bal = useBalances();
  const fx = useOracle();
  const hist = useFxHistory();
  const pts = hist.data ?? [];
  const first = pts[0]?.rate;
  const change = fx.rate !== undefined && first ? ((fx.rate - first) / first) * 100 : undefined;
  const usd = bal.ousd !== undefined ? Number(bal.ousd) / 1e6 : undefined;
  const mxn = bal.xmxn !== undefined ? Number(bal.xmxn) / 1e6 : undefined;
  const total = usd !== undefined && mxn !== undefined && fx.rate ? usd + mxn / fx.rate : undefined;
  return (
    <section className="mt-7 px-4" aria-label="Saldo">
      <BalanceHead label="Saldo total" />
      <Money value={total} currency="USD" size={52} className="mt-2" />
      <div className="mt-3 flex items-center gap-3">
        <span className="m-meta text-[var(--m-on-surface)]">
          1 USD = {fmtNumber(fx.rate, 2)} MXN
          {change !== undefined && Math.abs(change) >= 0.005 ? ` ${change > 0 ? "▲" : "▼"}${fmtNumber(Math.abs(change), 2)}%` : ""}
        </span>
        {pts.length >= 3 && <Sparkline points={pts} />}
      </div>
    </section>
  );
}

function CurrencyTiles() {
  const bal = useBalances();
  const usd = bal.ousd !== undefined ? Number(bal.ousd) / 1e6 : undefined;
  const mxn = bal.xmxn !== undefined ? Number(bal.xmxn) / 1e6 : undefined;
  return (
    <div className="grid grid-cols-2 gap-2">
      <CurrencyBlock flag={<FlagUS />} code="USD" name="Dólares" amount={usd === undefined ? "—" : `US${fmtMoney(usd)}`} sub="OUSD de prueba" style={{ background: INK, color: "#fff" }} />
      <CurrencyBlock flag={<FlagMX />} code="MXN" name="Pesos" amount={mxn === undefined ? "—" : `MX${fmtMoney(mxn)}`} sub="xMXN demo" style={{ background: CREAM, color: INK }} />
    </div>
  );
}

function CurrencyBlock({ flag, code, name, amount, sub, style }: { flag: ReactNode; code: string; name: string; amount: string; sub: string; style: CSSProperties }) {
  return (
    <div className="grid min-w-0 gap-3 rounded-[8px] p-3.5" style={style}>
      <div className="flex items-center gap-2">
        {flag}
        <span className="truncate text-[11.5px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase opacity-80" title={code}>
          {name}
        </span>
      </div>
      <div className="min-w-0">
        <Display size={22} fit className="leading-tight">
          <TickerText text={amount} />
        </Display>
        <p data-honesty className="mt-1 text-[11.5px] font-medium tracking-[0.06em] uppercase opacity-70">
          {sub}
        </p>
      </div>
    </div>
  );
}

function FlagUS() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-label="Estados Unidos" role="img">
      <clipPath id="m-flag-us">
        <circle cx="10" cy="10" r="10" />
      </clipPath>
      <g clipPath="url(#m-flag-us)">
        <rect width="20" height="20" fill="#fff" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={i} y={i * 3.08} width="20" height="1.54" fill="#b22234" />
        ))}
        <rect width="10" height="10.8" fill="#3c3b6e" />
      </g>
    </svg>
  );
}

function FlagMX() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-label="México" role="img">
      <clipPath id="m-flag-mx">
        <circle cx="10" cy="10" r="10" />
      </clipPath>
      <g clipPath="url(#m-flag-mx)">
        <rect width="7" height="20" fill="#006847" />
        <rect x="7" width="6" height="20" fill="#fff" />
        <rect x="13" width="7" height="20" fill="#ce1126" />
        <circle cx="10" cy="10" r="1.8" fill="#8c5a2b" />
      </g>
    </svg>
  );
}

/** Line of the relay's real on-chain pushes (setPrice only), scaled to its own range. */
function Sparkline({ points }: { points: FxPoint[] }) {
  const w = 72;
  const h = 20;
  const rates = points.map((p) => p.rate);
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  const span = hi - lo || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 2 - ((p.rate - lo) / span) * (h - 4)] as const);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="shrink-0 overflow-visible" role="img" aria-label={`Últimas ${points.length} actualizaciones del tipo en cadena`}>
      <title>{`Relay on-chain: ${points.length} pushes · ${fmtNumber(lo, 4)}–${fmtNumber(hi, 4)} MXN`}</title>
      <path d={d} fill="none" stroke={INK} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={INK} />
    </svg>
  );
}

/* ───────────────────────────── activity ───────────────────────────── */

type Entry = { kind: "send"; at: number; row: ActivityRow; contact?: Contact } | { kind: "bill"; at: number; order: RecentOrder };

function useEntries() {
  const { address } = useConnection();
  const feed = useActivityFeed("move", { account: address, limit: 30 });
  const orders = useRecentOrders();
  const entries = useMemo(() => {
    const sends: Entry[] = feed.rows
      .filter((r) => r.tokenOut === "xMXN" && r.account.toLowerCase() === address?.toLowerCase())
      .map((r) => ({
        kind: "send",
        at: r.timestamp ?? 0,
        row: r,
        contact: contactByAddress(r.to),
      }));
    const bills: Entry[] = orders.orders.map((o) => ({
      kind: "bill",
      at: Date.parse(o.createdAt) / 1000,
      order: o,
    }));
    return [...sends, ...bills].sort((a, b) => b.at - a.at);
  }, [feed.rows, orders.orders, address]);
  return { entries, loading: feed.isLoading, error: feed.error };
}

/** "Hoy" / "Ayer" / "Antes", by the CDMX calendar day. */
function dayGroup(at: number, now: number) {
  const day = (t: number) => Math.floor((t - 6 * 3600) / 86400);
  const d = day(now) - day(at);
  return d <= 0 ? "Hoy" : d === 1 ? "Ayer" : "Antes";
}

const hhmm = (t: number) => new Date((t - 6 * 3600) * 1000).toISOString().slice(11, 16);

function ActivityList({ limit, onEmpty }: { limit?: number; onEmpty: () => void }) {
  const { entries, loading, error } = useEntries();
  const now = useNow(30_000) ?? 0;
  if (loading && entries.length === 0) return <SkeletonList rows={3} />;
  if (error && entries.length === 0)
    return (
      <div className="px-4 pt-2">
        <Banner tone="error">No pudimos leer tus movimientos. Reintentando…</Banner>
      </div>
    );
  if (entries.length === 0)
    return (
      <EmptyState
        icon={<PaperPlane />}
        title="Haz tu primer envío"
        hint="Llega en segundos a tu familia."
        action={
          <Button size="md" className="mt-2" onClick={onEmpty}>
            Enviar
          </Button>
        }
      />
    );
  const shown = entries.slice(0, limit);
  // Rows arrive after the screen (async reads), so they own their entrance: a short stagger.
  return (
    <Stagger>
      {shown.map((e, i) => {
        const g = dayGroup(e.at, now);
        const head = i === 0 || dayGroup(shown[i - 1].at, now) !== g;
        const when = g === "Antes" ? haceTiempo(e.at, now) : hhmm(e.at);
        return (
          <div key={e.kind === "send" ? e.row.txHash + e.row.logIndex : e.order.orderId}>
            {head && <Meta className="px-4 pt-3 pb-1">{g}</Meta>}
            {e.kind === "send" ? (
              <ListItem
                href={e.row.url}
                leading={<Avatar name={e.contact?.name ?? "Envío"}>{e.contact ? undefined : <ArrowUpRight className="size-5" />}</Avatar>}
                headline={`Envío a ${e.contact?.name ?? shortAddr(e.row.to)}`}
                supporting={`${e.contact?.city ?? "En la cadena"} · ${when}`}
                trailing={`−US${fmtMoney(e.row.amount)}`}
                trailingSub={`MX${fmtMoney(e.row.amountOut)}`}
              />
            ) : (
              <ListItem
                href={e.order.receipt?.explorerUrl}
                leading={<BrandTile id={e.order.provider === "telcel" ? "telcel" : "cfe"} />}
                headline={e.order.provider === "telcel" ? "Tiempo Aire Telcel" : "Luz CFE"}
                supporting={`Simulado · ${statusEs(e.order.status)} · ${when}`}
                trailing={`−MX${fmtMoney(BigInt(e.order.amount))}`}
              />
            )}
          </div>
        );
      })}
    </Stagger>
  );
}

/** Who paid the Tempo network fee (TxStep.feePaidBy from the receipt's feePayer). */
const feeLine = (steps: { feePaidBy?: "sponsor" | "you" }[]) =>
  steps.some((st) => st.feePaidBy === "you") ? "Pagada por ti" : steps.every((st) => st.feePaidBy === "sponsor") ? "Cubierta por Mercado" : "—";

const statusEs = (st: string) =>
  ({
    CREATED: "pendiente",
    PAYMENT_VERIFIED: "pagado",
    FULFILLED_SIMULATED: "pagado",
    FAILED: "falló",
  })[st] ?? st;

function PaperPlane() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden>
      <path d="M6 30 58 8 46 56 32 38 6 30Z" fill={CREAM} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 38 58 8" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 38v13l7-7" fill={TERRACOTTA} stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Actividad({ s }: AppProps) {
  return (
    <div className="pb-4">
      <TopAppBar title="Actividad" sub="Envíos y pagos" />
      <ActivityList onEmpty={() => s.setScreen("enviar")} />
    </div>
  );
}

/* ─────────────────────────────── Perfil ─────────────────────────────── */

function Perfil({ openOnramp }: AppProps) {
  const { address } = useConnection();
  const snack = useSnackbar();
  return (
    <div className="pb-4">
      <TopAppBar title="Perfil" sub="Cuenta demo" />
      <div className="flex items-center gap-4 px-4 pt-2 pb-5">
        <Avatar name="Sender US" size={64}>
          S
        </Avatar>
        <div className="min-w-0">
          <Display size={24}>Sender (US)</Display>
          <button
            type="button"
            onClick={() => address && navigator.clipboard?.writeText(address).then(() => snack("Dirección copiada"))}
            className="mt-1 font-mono text-[13px] text-[var(--m-on-surface-variant)]"
          >
            {shortAddr(address)} · copiar
          </button>
        </div>
      </div>
      <div className="border-t border-[var(--m-outline-variant)]">
        <ListItem
          divider
          leading={
            <RowIcon>
              <Wallet />
            </RowIcon>
          }
          headline="Agregar dólares"
          supporting="Tarjeta (simulada) o Tempo Wallet"
          onClick={openOnramp}
        />
        <ListItem
          divider
          leading={
            <RowIcon>
              <ShieldCheck />
            </RowIcon>
          }
          headline="Red"
          supporting="Tempo Moderato · testnet"
        />
        {address && (
          <ListItem
            divider
            leading={
              <RowIcon>
                <ExternalLink />
              </RowIcon>
            }
            headline="Mi cuenta en el explorador"
            supporting="explore.testnet.tempo.xyz"
            href={`https://explore.testnet.tempo.xyz/address/${address}`}
          />
        )}
      </div>
      <Meta honesty className="mt-5 px-4">
        Testnet · sin valor real · no canjeable · sin retiro a banco
      </Meta>
    </div>
  );
}

const RowIcon = ({ children }: { children: ReactNode }) => (
  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--m-outline-variant)] [&_svg]:size-5 [&_svg]:stroke-[1.75]">{children}</span>
);

/* ─────────────────────────────── Enviar ─────────────────────────────── */

function Enviar({ s }: AppProps) {
  const bal = useBalances();
  const { send, amount, setAmount, memo } = s;
  const contact = contactByAddress(s.to) ?? contacts[0];
  const [review, setReview] = useState(false);
  const [pick, setPick] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const amt = toUnits(amount);
  const q = send.quote;
  const rate = q.amountOut !== undefined && amt > 0n ? Number(q.amountOut) / Number(amt) : undefined;
  const overBalance = bal.ousd !== undefined && amt > bal.ousd;
  const memoTooLong = memoByteLength(memo) > MEMO_MAX_BYTES;
  const busy = send.tx.isBusy;
  const can = !busy && amt > 0n && !overBalance && !memoTooLong && q.amountOut !== undefined && !q.error && !!s.to && !send.stranded;

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar title="Enviar" sub="A México · llega al instante" onBack={busy ? undefined : () => s.setScreen("inicio")} />
      <Pressable onClick={() => setPick(true)} disabled={busy} className="flex w-full items-center gap-3 border-y border-[var(--m-outline-variant)] px-4 py-3 text-left">
        <Avatar name={contact?.name ?? "?"} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold">
            {contact?.name} · {contact?.city}
          </span>
          <span className="block truncate font-mono text-[12.5px] text-[var(--m-on-surface-variant)]">{shortAddr(s.to)}</span>
        </span>
        <span className="m-meta text-[var(--m-on-surface)] underline underline-offset-4">Cambiar</span>
      </Pressable>

      <div className="px-4 pt-5">
        <Meta>Envías</Meta>
        <Display size={60} fit className={cn("mt-2", overBalance && "text-[var(--m-error)]")}>
          US${fmtTyping(amount)}
        </Display>
        <Meta className="mt-2">{overBalance ? "Saldo insuficiente" : `Disponible US${fmtMoney(bal.ousd)}`}</Meta>
        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-[var(--m-outline-variant)] pt-3">
          <span className="text-[15px]">{contact?.name} recibe</span>
          <Display size={26} style={{ color: TERRACOTTA }}>
            <TickerText text={q.amountOut !== undefined && amt > 0n ? `MX${fmtMoney(q.amountOut)}` : q.loading && amt > 0n ? "…" : "MX$0.00"} />
          </Display>
        </div>
        <Meta className="mt-1 text-right">{rate !== undefined ? `1 USD = ${fmtNumber(rate, 4)} MXN · comisión incluida` : "Cotización en vivo"}</Meta>
        {q.error && amt > 0n && <p className="mt-1 text-[13px] text-[var(--m-error)]">{q.error}</p>}
      </div>

      <div className="mt-3 flex gap-2 px-4">
        {[20, 50, 100, 200].map((v) => (
          <Chip key={v} selected={amount === String(v)} disabled={busy} onClick={() => setAmount(String(v))}>
            ${v}
          </Chip>
        ))}
      </div>
      <button type="button" disabled={busy} onClick={() => setNoteOpen(true)} className="m-meta mt-2 h-9 self-start px-4 text-[var(--m-on-surface)]">
        {memo ? <>Nota: “{memo}” · editar</> : "+ Agregar nota"}
      </button>

      <div className="mt-auto px-4 pt-1 pb-3">
        <NumericKeypad value={amount} onChange={setAmount} disabled={busy} />
        {send.stranded ? (
          <StrandedRecovery s={s} />
        ) : (
          <Button className="mt-2 w-full" disabled={!can} onClick={() => setReview(true)}>
            Continuar
          </Button>
        )}
      </div>

      <BottomSheet open={pick} onClose={() => setPick(false)} title="¿A quién?" sub="Contactos demo · wallets reales de testnet">
        <div className="border-t border-[var(--m-outline-variant)]">
          {contacts.map((c) => (
            <ListItem
              key={c.id}
              divider
              leading={<Avatar name={c.name} />}
              headline={`${c.name} · ${c.city}`}
              supporting={<span className="font-mono">{shortAddr(c.address)}</span>}
              onClick={() => {
                s.setTo(c.address);
                setPick(false);
              }}
              trailing={c.address === s.to ? "✓" : undefined}
            />
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Nota" sub="Pública · se guarda en la cadena">
        <div className="grid gap-3 px-6">
          <label className="grid gap-1">
            <input
              autoFocus
              value={memo}
              onChange={(e) => s.setMemo(e.target.value)}
              placeholder="para mamá"
              aria-label="Nota"
              className="h-14 border-b-2 border-[var(--m-outline)] bg-transparent text-[20px] outline-none focus:border-[var(--m-accent)]"
            />
            <span className={cn("m-meta text-right", memoTooLong && "text-[var(--m-error)]")}>
              {memoByteLength(memo)}/{MEMO_MAX_BYTES} bytes
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {["para mamá", "para la renta", "feliz cumple", "para la luz"].map((t) => (
              <Chip key={t} selected={memo === t} onClick={() => s.setMemo(t)}>
                {t}
              </Chip>
            ))}
          </div>
          <Button onClick={() => setNoteOpen(false)} disabled={memoTooLong}>
            Listo
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={review} onClose={() => setReview(false)} dismissable={!busy} title="Revisa tu envío" sub={`A ${contact?.name} · ${contact?.city}`}>
        <div className="grid gap-4 px-6">
          {busy && <LinearProgress />}
          <DetailRows
            rows={[
              {
                label: "Envías",
                value: `US${fmtMoney(amt)}`,
                sub: "OUSD de prueba",
                subHonesty: true,
              },
              {
                label: "Tipo de cambio",
                value: rate !== undefined ? `${fmtNumber(rate, 4)} MXN` : "—",
                sub: "comisión incluida",
              },
              {
                label: `${contact?.name} recibe`,
                value: q.amountOut !== undefined ? `MX${fmtMoney(q.amountOut)}` : "—",
                sub: "xMXN en su wallet",
              },
              { label: "Llega", value: "Al instante", sub: "en la cadena" },
              ...(memo ? [{ label: "Nota", value: `“${memo}”` }] : []),
            ]}
          />
          {send.tx.status === "error" && send.tx.error && <Banner tone="error">{send.tx.error}</Banner>}
          <Button variant="accent" loading={busy} disabled={!can && !busy} onClick={() => s.doSend()}>
            {busy ? `${send.tx.stepLabel ?? "Enviando"}…` : `Enviar US${fmtMoney(amt)}`}
          </Button>
          <Meta honesty className="text-center">
            Testnet · sin retiro a banco
          </Meta>
        </div>
      </BottomSheet>
    </div>
  );
}

function StrandedRecovery({ s }: { s: RemesasState }) {
  const send = s.send;
  const busy = send.tx.isBusy;
  const name = contactByAddress(send.stranded!.to)?.name ?? shortAddr(send.stranded!.to);
  return (
    <div className="mt-2 grid gap-2">
      <Banner tone="info">
        Ya convertimos tus dólares, pero la entrega falló. Tus MX
        {fmtMoney(send.stranded!.amount)} están a salvo en tu cuenta.
      </Banner>
      <Button
        variant="accent"
        loading={busy}
        disabled={busy}
        onClick={async () => {
          const r = await send.deliverStranded().catch(() => undefined);
          if (r) s.setScreen("enviado");
        }}
      >
        Entregar MX{fmtMoney(send.stranded!.amount)} a {name}
      </Button>
      {send.tx.status === "error" && send.tx.error && <p className="text-[13px] text-[var(--m-error)]">{send.tx.error}</p>}
      {send.recoveryNote && <p className="text-[13px] text-[var(--m-on-surface-variant)]">{send.recoveryNote}</p>}
    </div>
  );
}

/* ─────────────────────────────── Enviado ─────────────────────────────── */

function Enviado({ s }: AppProps) {
  const r = s.send.receipt;
  const c = contactByAddress(r?.to);
  const name = c?.name ?? "tu familia";
  return (
    <SuccessScreen
      title={<>Enviado a {name}</>}
      amount={r ? `MX${fmtMoney(r.delivered)}` : undefined}
      caption={r ? "En su wallet · en la cadena" : undefined}
      action={
        <Button
          className="w-full"
          onClick={() => {
            s.send.reset();
            s.setAmount("");
            s.setMemo("");
            s.setScreen("inicio");
          }}
        >
          Listo
        </Button>
      }
    >
      {r && (
        <div className="grid gap-4">
          {r.memo && (
            <p className="w-fit rounded-[8px] px-3 py-2 text-[15px]" style={{ background: CREAM }}>
              “{r.memo}”
            </p>
          )}
          <DetailRows
            rows={[
              { label: "Enviaste", value: `US${fmtMoney(r.amountIn)}` },
              {
                label: "Tipo aplicado",
                value: `${fmtNumber(Number(r.delivered) / Number(r.amountIn), 4)} MXN`,
              },
              { label: "Comisión de red", value: feeLine(r.steps) },
              {
                label: "Comprobante",
                value: (
                  <a href={r.steps.at(-1)?.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono underline underline-offset-4">
                    {r.steps.at(-1)?.hash.slice(0, 10)}… <ExternalLink className="size-3.5" />
                  </a>
                ),
              },
            ]}
          />
        </div>
      )}
    </SuccessScreen>
  );
}

/* ─────────────────────────────── Pagar ─────────────────────────────── */

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

  if (done) return <PaidReceipt s={s} />;
  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar title={airtime ? "Tiempo Aire" : "Servicios"} sub={airtime ? "Recarga Telcel" : "Luz CFE"} onBack={inFlight ? undefined : () => (bill.reset(), s.setScreen("inicio"))} />
      {inFlight && <LinearProgress />}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 pt-2 pb-4">
        <div className="flex items-center gap-3 border-y border-[var(--m-outline-variant)] py-3">
          <BrandTile id={airtime ? "telcel" : "cfe"} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold">{airtime ? "Telcel" : "CFE"}</p>
            <Meta>Sin afiliación</Meta>
          </div>
          <DemoBadge>Simulado</DemoBadge>
        </div>
        <Meta honesty className="-mt-2">
          Simulado: el pago es real en Tempo; {airtime ? "la recarga" : "el pago al proveedor"} no se entrega
        </Meta>
        <label className="grid gap-1">
          <Meta>{airtime ? "Número Telcel · 10 dígitos" : "Número de servicio · 12 dígitos"}</Meta>
          <span className="flex h-14 items-center gap-3 border-b-2 border-[var(--m-outline)] focus-within:border-[var(--m-accent)]">
            {airtime ? <Phone className="size-5" strokeWidth={1.75} /> : <Lightbulb className="size-5" strokeWidth={1.75} />}
            <input
              inputMode="numeric"
              value={airtime ? phone : service}
              disabled={inFlight}
              onChange={(e) => change(() => (airtime ? setPhone : setService)(e.target.value.replace(/\D/g, "").slice(0, airtime ? 10 : 12)))}
              placeholder={airtime ? "55 1234 5678" : "123456789012"}
              aria-label={airtime ? "Número Telcel" : "Número de servicio CFE"}
              className="m-num h-full w-full min-w-0 flex-1 bg-transparent text-[20px] outline-none"
            />
          </span>
        </label>
        <div>
          <Meta className="mb-2">Monto · MXN</Meta>
          <div className="flex flex-wrap gap-2">
            {amounts.map((a) => (
              <Chip key={a} selected={mxn === a} disabled={inFlight} onClick={() => change(() => setMxn(a))}>
                ${a}
              </Chip>
            ))}
          </div>
        </div>
        {bill.quote && (
          <div className="border-t border-[var(--m-outline-variant)] pt-3">
            <Meta>{bill.quote.description}</Meta>
            <Display size={36} className="mt-2">
              MX{fmtMoney(BigInt(bill.quote.amount))}
            </Display>
            <Meta className="mt-2">Pagas en xMXN · saldo MX{fmtMoney(bal.xmxn)}</Meta>
            {short && (
              <div className="mt-3 grid gap-2">
                <p className="text-[14px]">Necesitas pesos para pagar.</p>
                <Button
                  variant="outlined"
                  size="md"
                  loading={s.send.tx.isBusy}
                  disabled={s.send.tx.isBusy || !address}
                  onClick={() => address && quoteAmount !== undefined && s.send.convert(quoteAmount - (bal.xmxn ?? 0n), address).catch(() => undefined)}
                >
                  {s.send.tx.isBusy ? `${s.send.tx.stepLabel ?? "Convirtiendo"}…` : "Convertir dólares a pesos"}
                </Button>
                {s.send.tx.status === "error" && s.send.tx.error && <p className="text-[13px] text-[var(--m-error)]">{s.send.tx.error}</p>}
              </div>
            )}
          </div>
        )}
        {bill.error && <Banner tone="error">{bill.error}</Banner>}
      </div>
      <div className="mt-auto px-4 pb-4">
        {!bill.quote ? (
          <Button
            className="w-full"
            loading={bill.stage === "quoting"}
            disabled={!valid || inFlight}
            onClick={() => bill.requestQuote(airtime ? { provider: "telcel", phone, amountMxn: mxn } : { provider: "cfe", serviceNumber: service, amountMxn: mxn })}
          >
            {bill.stage === "quoting" ? "Cotizando…" : "Continuar"}
          </Button>
        ) : (
          <Button variant="accent" className="w-full" loading={inFlight} disabled={!bill.canPay || inFlight || short} onClick={() => bill.pay()}>
            {inFlight ? `${STAGE_ES[bill.stage] ?? "Pagando"}…` : `Pagar MX${fmtMoney(BigInt(bill.quote.amount))}`}
          </Button>
        )}
      </div>
    </div>
  );
}

export const STAGE_ES: Record<string, string> = {
  requesting: "Pidiendo cobro",
  challenge: "402: pago requerido",
  signing: "Firmando pago",
  verifying: "Verificando en Tempo",
};

function PaidReceipt({ s }: { s: RemesasState }) {
  const r = s.bill.result!;
  const telcel = r.fulfillment?.providerName?.toLowerCase().includes("telcel") ?? s.screen === "aire";
  return (
    <SuccessScreen
      title="Pagado"
      amount={`MX${fmtMoney(BigInt(r.receipt.amount))}`}
      caption="Pago real en Tempo · recarga simulada"
      action={
        <Button
          className="w-full"
          onClick={() => {
            s.bill.reset();
            s.setScreen("inicio");
          }}
        >
          Listo
        </Button>
      }
    >
      <DetailRows
        rows={[
          {
            label: "Proveedor",
            value: <BrandLogo id={telcel ? "telcel" : "cfe"} height={telcel ? 13 : 22} />,
            sub: "Simulado: no se entrega",
          },
          {
            label: "Pago",
            value: (
              <a href={r.receipt.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono underline underline-offset-4">
                {r.receipt.txHash.slice(0, 10)}… <ExternalLink className="size-3.5" />
              </a>
            ),
            sub: "Real · MPP 402",
          },
          ...(r.fulfillment
            ? [
                {
                  label: "Referencia",
                  value: <span className="font-mono">{r.fulfillment.reference}</span>,
                },
              ]
            : []),
        ]}
      />
    </SuccessScreen>
  );
}
