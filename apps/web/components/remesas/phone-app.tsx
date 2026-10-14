"use client";
// The Remesas Android app (inside PhoneFrame on desktop, full-screen on phones), built on the mobile kit.
// Spanish first, English sub-labels. Every number is live: balances and quotes from chain, sends on the
// v2 exchange, bills through the real MPP 402 flow. Only the card charge on the on-ramp and the
// airtime/bill FULFILLMENT are simulated, and both say so.
import { useMemo, useState, type ReactNode } from "react";
import { useConnection } from "wagmi";
import {
  ArrowUpRight,
  Bell,
  ChevronRight,
  CircleUserRound,
  ExternalLink,
  History,
  House,
  Lightbulb,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import { MEMO_MAX_BYTES, memoByteLength, useBalances, useOracle } from "@/lib/contracts";
import { useActivityFeed, type ActivityRow } from "@/lib/contracts/activity";
import { fmtAmount, fmtNumber, shortAddr, toUnits } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { CONTACTS, contactByAddress, type Contact } from "@/components/wallet/personas";
import { TELCEL_AMOUNTS, useRecentOrders, type RecentOrder } from "@/components/billpay/use-bill-pay";
import {
  Avatar,
  Banner,
  BottomNav,
  BottomSheet,
  BrandLogo,
  BrandTile,
  Button,
  Chip,
  DemoBadge,
  DetailRows,
  EmptyState,
  HonestyNote,
  IconButton,
  LinearProgress,
  ListHeader,
  ListItem,
  NumericKeypad,
  Pressable,
  ScreenTransition,
  SkeletonList,
  SuccessScreen,
  TopAppBar,
  fmtMoney,
  fmtTyping,
  haceTiempo,
  useNavDirection,
  useSnackbar,
  type NavItem,
} from "@/components/mobile";
import { OnrampSheet } from "./onramp-sheet";
import { useFxHistory, type FxPoint } from "./use-fx-history";
import type { RemesasState } from "./remesas-screen";

export type Screen = "inicio" | "enviar" | "enviado" | "aire" | "servicios" | "actividad" | "perfil";
const ORDER: Screen[] = ["inicio", "actividad", "perfil", "enviar", "aire", "servicios", "enviado"];
const TABS: NavItem<"inicio" | "enviar" | "actividad" | "perfil">[] = [
  { id: "inicio", label: "Inicio", icon: <House strokeWidth={1.75} /> },
  { id: "enviar", label: "Enviar", icon: <Send strokeWidth={1.75} /> },
  { id: "actividad", label: "Actividad", icon: <History strokeWidth={1.75} /> },
  { id: "perfil", label: "Perfil", icon: <CircleUserRound strokeWidth={1.75} /> },
];

export const ORANGE = "#ff8a1f";
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
      {tab && <BottomNav items={TABS} value={screen as "inicio"} onChange={(id) => s.setScreen(id)} />}
      <BottomSheet open={onramp} onClose={() => setOnramp(false)} title="Agregar dólares" sub="Add dollars with a card">
        <OnrampSheet onDone={() => setOnramp(false)} />
      </BottomSheet>
    </div>
  );
}

type AppProps = { s: RemesasState; openOnramp: () => void };

/* ─────────────────────────────── Inicio ─────────────────────────────── */

function greeting(now?: number) {
  if (!now) return "Hola";
  // CDMX is UTC−6 all year.
  const h = new Date((now - 6 * 3600) * 1000).getUTCHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

function Inicio({ s, openOnramp }: AppProps) {
  const now = useNow(60_000);
  const snack = useSnackbar();
  const start = (c?: Contact) => {
    if (c?.address) s.setTo(c.address);
    s.setScreen("enviar");
  };
  return (
    <div className="pb-4">
      <header className="flex h-16 items-center gap-3 px-4">
        <span className="grid size-10 place-items-center rounded-[12px] text-[19px] font-semibold text-white" style={{ background: ORANGE }} aria-hidden>
          M
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-tight text-[var(--m-on-surface-variant)]">{greeting(now)}</p>
          <p className="text-[18px] leading-tight font-medium">Mercado Remesas</p>
        </div>
        <IconButton label="Notificaciones" onClick={() => snack("Sin notificaciones nuevas")}>
          <Bell className="size-6" strokeWidth={1.75} />
        </IconButton>
      </header>

      <BalanceHero />

      <div className="mt-5 grid grid-cols-4 px-2">
        <QuickAction icon={<Send strokeWidth={1.75} />} label="Enviar" onClick={() => start()} primary />
        <QuickAction icon={<Smartphone strokeWidth={1.75} />} label="Tiempo Aire" onClick={() => s.setScreen("aire")} />
        <QuickAction icon={<Lightbulb strokeWidth={1.75} />} label="Servicios" onClick={() => s.setScreen("servicios")} />
        <QuickAction icon={<Plus strokeWidth={1.75} />} label="Agregar dólares" onClick={openOnramp} />
      </div>

      <ListHeader>Envía a</ListHeader>
      <div className="m-scroll flex gap-1 overflow-x-auto px-2 pb-1">
        {contacts.map((c) => (
          <Pressable key={c.id} onClick={() => start(c)} className="grid w-[84px] shrink-0 justify-items-center gap-1.5 rounded-[16px] py-2">
            <Avatar name={c.name} size={56} />
            <span className="grid text-center leading-tight">
              <span className="text-[14px] font-medium">{c.name}</span>
              <span className="text-[13px] text-[var(--m-on-surface-variant)]">{c.city}</span>
            </span>
          </Pressable>
        ))}
        <Pressable onClick={() => snack("Demo: contactos fijos en este prototipo")} className="grid w-[84px] shrink-0 justify-items-center gap-1.5 rounded-[16px] py-2">
          <span className="grid size-14 place-items-center rounded-full border border-dashed border-[var(--m-outline)] text-[var(--m-on-surface-variant)]">
            <Plus className="size-6" strokeWidth={1.75} />
          </span>
          <span className="text-[14px] font-medium text-[var(--m-on-surface-variant)]">Nuevo</span>
        </Pressable>
      </div>

      <ListHeader
        action={
          <button type="button" onClick={() => s.setScreen("actividad")} className="h-10 rounded-full px-3 text-[14px] font-medium" style={{ color: "#b45309" }}>
            Ver todo
          </button>
        }
      >
        Movimientos
      </ListHeader>
      <ActivityList limit={4} onEmpty={() => start()} />
      <HonestyNote className="mt-3">Saldo en testnet OUSD, sin valor real · Testnet demo, no real money.</HonestyNote>
    </div>
  );
}

function QuickAction({ icon, label, onClick, primary }: { icon: ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <Pressable onClick={onClick} className="grid content-start justify-items-center gap-2 rounded-[16px] px-1 py-2">
      <span
        className={cn(
          "grid size-14 place-items-center rounded-full [&_svg]:size-6",
          primary ? "text-white shadow-[0_4px_12px_-4px_rgb(255_138_31/0.7)]" : "bg-[var(--m-accent-container)] text-[#8a3d00]",
        )}
        style={primary ? { background: ORANGE } : undefined}
      >
        {icon}
      </span>
      <span className="text-center text-[13px] leading-tight font-medium">{label}</span>
    </Pressable>
  );
}

function BalanceHero() {
  const bal = useBalances();
  const fx = useOracle();
  const hist = useFxHistory();
  const pts = hist.data ?? [];
  const first = pts[0]?.rate;
  const change = fx.rate !== undefined && first ? ((fx.rate - first) / first) * 100 : undefined;
  const usd = bal.ousd;
  const mxnEquiv = usd !== undefined && fx.rate !== undefined ? (Number(usd) / 1e6) * fx.rate : undefined;
  const [whole, cents] = usd === undefined ? ["—", ""] : fmtMoney(usd).split(".");
  return (
    <section className="relative mx-4 overflow-hidden rounded-[28px] px-5 pt-5 pb-4 text-white" style={{ background: ORANGE }} aria-label="Tu saldo">
      {/* tonal layers (flat shapes, no gradients) */}
      <span aria-hidden className="absolute -top-16 -right-12 size-56 rounded-full bg-white/[0.10]" />
      <span aria-hidden className="absolute -right-24 -bottom-28 size-64 rounded-full bg-[#e06a00]/45" />
      <span aria-hidden className="absolute top-24 -left-16 size-40 rounded-full bg-[#ffa94d]/40" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-medium text-white/90">Tu saldo · USD</p>
          <DemoBadge tone="onAccent">testnet</DemoBadge>
        </div>
        <p className="m-num mt-1 text-[44px] leading-none font-medium tracking-[-0.02em]">
          <span className="mr-0.5 align-top text-[22px] leading-[1.6] font-normal text-white/85">US</span>
          {whole}
          {cents && <span className="text-[26px] text-white/85">.{cents}</span>}
        </p>
        <p className="m-num mt-2 text-[15px] text-white/95">≈ MX{mxnEquiv === undefined ? "$—" : fmtMoney(mxnEquiv, 0)} al tipo de hoy</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/20 pr-3 pl-2.5 text-[13px] font-medium whitespace-nowrap">
            <span className="relative grid size-2 place-items-center">
              <span className="absolute size-2 animate-ping rounded-full bg-white/70" />
              <span className="size-2 rounded-full bg-white" />
            </span>
            <span className="m-num">{fmtNumber(fx.rate, 2)} MXN</span>
            {change !== undefined && Math.abs(change) >= 0.005 && <span className="m-num text-white/85">{change > 0 ? "▲" : "▼"}{fmtNumber(Math.abs(change), 2)}%</span>}
          </span>
          {pts.length >= 3 ? <Sparkline points={pts} /> : <span className="text-[13px] text-white/75">{hist.isLoading ? "" : "historial no disponible"}</span>}
        </div>
        <p className="mt-3 border-t border-white/25 pt-2.5 text-[13px] text-white/90">
          <span className="m-num font-medium">MX{fmtMoney(bal.xmxn)}</span> en pesos · xMXN demo
        </p>
      </div>
    </section>
  );
}

/** White line of the relay's real on-chain pushes; scaled to its own range. */
function Sparkline({ points }: { points: FxPoint[] }) {
  const w = 84;
  const h = 32;
  const rates = points.map((p) => p.rate);
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  const span = hi - lo || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 3 - ((p.rate - lo) / span) * (h - 6)] as const);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className="shrink-0 overflow-visible"
      role="img"
      aria-label={`Últimas ${points.length} actualizaciones del tipo de cambio en cadena, de ${fmtNumber(lo, 4)} a ${fmtNumber(hi, 4)}`}
    >
      <title>{`Relay on-chain: ${points.length} pushes · ${fmtNumber(lo, 4)}–${fmtNumber(hi, 4)} MXN`}</title>
      <path d={d} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
      <circle cx={lx} cy={ly} r={3} fill="white" />
    </svg>
  );
}

/* ───────────────────────────── activity ───────────────────────────── */

type Entry =
  | { kind: "send"; at: number; row: ActivityRow; contact?: Contact }
  | { kind: "bill"; at: number; order: RecentOrder };

function useEntries() {
  const { address } = useConnection();
  const feed = useActivityFeed("move", { account: address, limit: 30 });
  const orders = useRecentOrders();
  const entries = useMemo(() => {
    const sends: Entry[] = feed.rows
      .filter((r) => r.tokenOut === "xMXN" && r.account.toLowerCase() === address?.toLowerCase())
      .map((r) => ({ kind: "send", at: r.timestamp ?? 0, row: r, contact: contactByAddress(r.to) }));
    const bills: Entry[] = orders.orders.map((o) => ({ kind: "bill", at: Date.parse(o.createdAt) / 1000, order: o }));
    return [...sends, ...bills].sort((a, b) => b.at - a.at);
  }, [feed.rows, orders.orders, address]);
  return { entries, loading: feed.isLoading, error: feed.error };
}

function ActivityList({ limit, onEmpty }: { limit?: number; onEmpty: () => void }) {
  const { entries, loading, error } = useEntries();
  const now = useNow(30_000) ?? 0;
  if (loading && entries.length === 0) return <SkeletonList rows={3} />;
  if (error && entries.length === 0)
    return (
      <div className="px-4">
        <Banner tone="error">No pudimos leer tus movimientos · couldn&apos;t load activity. Reintentando…</Banner>
      </div>
    );
  if (entries.length === 0)
    return (
      <EmptyState
        icon={<PaperPlane />}
        title="Haz tu primer envío"
        hint="Tus envíos y pagos aparecerán aquí · Your transfers will show up here."
        action={
          <Button size="md" variant="tonal" className="mt-2" onClick={onEmpty}>
            Enviar ahora
          </Button>
        }
      />
    );
  return (
    <ul>
      {entries.slice(0, limit).map((e) => (
        <li key={e.kind === "send" ? e.row.txHash + e.row.logIndex : e.order.orderId}>
          {e.kind === "send" ? (
            <ListItem
              href={e.row.url}
              leading={<Avatar name={e.contact?.name ?? "Envío"}>{e.contact ? undefined : <ArrowUpRight className="size-5" />}</Avatar>}
              headline={`Envío a ${e.contact?.name ?? shortAddr(e.row.to)}`}
              supporting={`${haceTiempo(e.at, now)} · ${e.contact?.city ?? "on-chain"}`}
              trailing={`-US${fmtMoney(e.row.amount)}`}
              trailingSub={`MX${fmtMoney(e.row.amountOut)}`}
            />
          ) : (
            <ListItem
              href={e.order.receipt?.explorerUrl}
              leading={<BrandTile id={e.order.provider === "telcel" ? "telcel" : "cfe"} />}
              headline={e.order.provider === "telcel" ? "Tiempo Aire Telcel" : "Luz CFE"}
              supporting={
                <span className="flex items-center gap-1.5">
                  {haceTiempo(e.at, now)} <DemoBadge className="h-5 px-1.5 text-[12px]">SIMULATED</DemoBadge>
                </span>
              }
              trailing={`-MX${fmtMoney(BigInt(e.order.amount))}`}
              trailingSub={statusEs(e.order.status)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

const statusEs = (st: string) =>
  ({ CREATED: "Pendiente", PAYMENT_VERIFIED: "Pagado", FULFILLED_SIMULATED: "Pagado", FAILED: "Falló" })[st] ?? st;

function PaperPlane() {
  return (
    <svg viewBox="0 0 64 64" className="!size-10" fill="none" aria-hidden>
      <path d="M8 30 56 10 44 54 32 38 8 30Z" fill="#ffdcc2" stroke={ORANGE} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 38 56 10" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 38v12l6-6" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Actividad({ s }: AppProps) {
  return (
    <div className="pb-4">
      <TopAppBar title="Actividad" sub="Envíos y pagos · Activity" />
      <ActivityList onEmpty={() => s.setScreen("enviar")} />
      <HonestyNote className="mt-3">Los envíos se leen de la cadena (Tempo testnet). Los pagos de servicios son SIMULATED: el pago es real, la recarga no se entrega.</HonestyNote>
    </div>
  );
}

/* ─────────────────────────────── Perfil ─────────────────────────────── */

function Perfil({ openOnramp }: AppProps) {
  const { address } = useConnection();
  const snack = useSnackbar();
  return (
    <div className="pb-4">
      <TopAppBar title="Perfil" sub="Tu cuenta · Account" />
      <div className="flex items-center gap-4 px-4 pt-2 pb-4">
        <Avatar name="Sender US" size={56}>
          <Wallet className="size-6" strokeWidth={1.75} />
        </Avatar>
        <div className="min-w-0">
          <p className="text-[18px]">Cuenta demo · Sender (US)</p>
          <button
            type="button"
            onClick={() => address && navigator.clipboard?.writeText(address).then(() => snack("Dirección copiada"))}
            className="font-mono text-[13px] text-[var(--m-on-surface-variant)]"
          >
            {shortAddr(address)}
          </button>
        </div>
      </div>
      <ListItem leading={<Icon><Plus /></Icon>} headline="Agregar dólares" supporting="Tarjeta (simulada) o Tempo Wallet" onClick={openOnramp} trailing={<ChevronRight className="size-5 text-[var(--m-on-surface-variant)]" />} />
      <ListItem leading={<Icon><ShieldCheck /></Icon>} headline="Red" supporting="Tempo Moderato · testnet" />
      {address && (
        <ListItem
          leading={<Icon><ExternalLink /></Icon>}
          headline="Ver mi cuenta en el explorador"
          supporting="explore.testnet.tempo.xyz"
          href={`https://explore.testnet.tempo.xyz/address/${address}`}
        />
      )}
      <HonestyNote className="mt-4">
        Prototipo en testnet. OUSD es el token de prueba de Tempo (sin valor real, no canjeable). xMXN es un token demo. Sin retiro a banco (SPEI).
      </HonestyNote>
    </div>
  );
}

const Icon = ({ children }: { children: ReactNode }) => (
  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--m-surface-2)] text-[var(--m-on-surface-variant)] [&_svg]:size-5 [&_svg]:stroke-[1.75]">{children}</span>
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
      <TopAppBar title="Enviar a México" sub="Send money home" onBack={busy ? undefined : () => s.setScreen("inicio")} />
      <div className="px-4">
        <Pressable onClick={() => setPick(true)} disabled={busy} className="flex w-full items-center gap-3 rounded-[16px] bg-[var(--m-surface-1)] px-3 py-2.5 text-left">
          <Avatar name={contact?.name ?? "?"} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px]">
              {contact?.name} · {contact?.city}
            </span>
            <span className="block truncate font-mono text-[13px] text-[var(--m-on-surface-variant)]">demo wallet · {shortAddr(s.to)}</span>
          </span>
          <span className="text-[14px] font-medium text-[#b45309]">Cambiar</span>
        </Pressable>
      </div>

      <div className="mt-5 grid justify-items-center px-4 text-center">
        <p className="text-[14px] text-[var(--m-on-surface-variant)]">Envías · You send</p>
        <p className={cn("m-num mt-1 text-[48px] leading-none font-normal tracking-[-0.02em]", overBalance && "text-[var(--m-error)]")}>
          <span className="text-[24px] text-[var(--m-on-surface-variant)]">US$</span>
          {fmtTyping(amount)}
        </p>
        <p className="m-num mt-2 text-[13px] text-[var(--m-on-surface-variant)]">
          {overBalance ? "Saldo insuficiente · not enough balance" : `Disponible US${fmtMoney(bal.ousd)}`}
        </p>
        <div className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--m-accent-container)] px-4 text-[15px] text-[#7a3400]">
          {contact?.name} recibe
          <span className="m-num font-semibold">
            {q.amountOut !== undefined && amt > 0n ? `MX${fmtMoney(q.amountOut)}` : q.loading && amt > 0n ? "…" : "MX$0.00"}
          </span>
        </div>
        <p className="m-num mt-1.5 text-[13px] text-[var(--m-on-surface-variant)]">
          {rate !== undefined ? `1 USD = ${fmtNumber(rate, 4)} MXN · llega al instante` : "Cotización en vivo · live quote"}
        </p>
        {q.error && amt > 0n && <p className="mt-1 text-[13px] text-[var(--m-error)]">{q.error}</p>}
      </div>

      <div className="mt-2 flex justify-center gap-2 px-4">
        {[20, 50, 100, 200].map((v) => (
          <Chip key={v} selected={amount === String(v)} disabled={busy} onClick={() => setAmount(String(v))}>
            ${v}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex justify-center">
        <button type="button" disabled={busy} onClick={() => setNoteOpen(true)} className="h-10 rounded-full px-3 text-[14px] text-[var(--m-on-surface-variant)]">
          {memo ? <>Nota: &ldquo;{memo}&rdquo; · editar</> : "+ Agregar nota (pública, on-chain)"}
        </button>
      </div>

      <div className="mt-auto px-4 pt-1 pb-3">
        <NumericKeypad value={amount} onChange={setAmount} disabled={busy} />
        {send.stranded ? (
          <StrandedRecovery s={s} />
        ) : (
          <Button className="mt-2 w-full" disabled={!can} onClick={() => setReview(true)}>
            Revisar envío · Review
          </Button>
        )}
      </div>

      <BottomSheet open={pick} onClose={() => setPick(false)} title="¿A quién le envías?" sub="Demo contacts with real testnet wallets">
        <ul>
          {contacts.map((c) => (
            <li key={c.id}>
              <ListItem
                leading={<Avatar name={c.name} />}
                headline={`${c.name} · ${c.city}`}
                supporting={<span className="font-mono">{shortAddr(c.address)}</span>}
                onClick={() => {
                  s.setTo(c.address);
                  setPick(false);
                }}
                trailing={c.address === s.to ? <span className="text-[#b45309]">✓</span> : undefined}
              />
            </li>
          ))}
        </ul>
      </BottomSheet>

      <BottomSheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Nota para el envío" sub="Se guarda en la cadena y es pública · stored on-chain, public">
        <div className="grid gap-3 px-6">
          <label className="grid gap-1">
            <input
              autoFocus
              value={memo}
              onChange={(e) => s.setMemo(e.target.value)}
              placeholder="para mamá"
              className="h-14 rounded-[4px] border border-[var(--m-outline)] bg-transparent px-4 text-[16px] outline-none focus:border-2 focus:border-[var(--m-accent)]"
            />
            <span className={cn("text-right text-[13px] text-[var(--m-on-surface-variant)] tabular", memoTooLong && "text-[var(--m-error)]")}>
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

      <BottomSheet open={review} onClose={() => setReview(false)} dismissable={!busy} title="Revisa tu envío" sub="Review your transfer">
        <div className="grid gap-4 px-6">
          {busy && <LinearProgress />}
          <DetailRows
            rows={[
              { label: "Envías", value: `US${fmtMoney(amt)}`, sub: "testnet OUSD" },
              { label: "Tipo de cambio", value: rate !== undefined ? `${fmtNumber(rate, 4)} MXN` : "—", sub: "incluye comisión del exchange" },
              { label: `${contact?.name} recibe`, value: q.amountOut !== undefined ? `MX${fmtMoney(q.amountOut)}` : "—", sub: "xMXN, directo a su wallet" },
              { label: "Llega", value: "Al instante", sub: "on-chain, Tempo testnet" },
              ...(memo ? [{ label: "Nota", value: `“${memo}”` }] : []),
            ]}
          />
          {send.tx.status === "error" && send.tx.error && <Banner tone="error">{send.tx.error}</Banner>}
          <Button
            loading={busy}
            disabled={!can && !busy}
            onClick={async () => {
              await s.doSend();
            }}
          >
            {busy ? `${send.tx.stepLabel ?? "Enviando"}…` : `Enviar US${fmtMoney(amt)}`}
          </Button>
          <p className="text-center text-[13px] text-[var(--m-on-surface-variant)]">Sin retiro a banco (SPEI) en este prototipo · on-chain delivery only</p>
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
        Ya convertimos tus dólares, pero la entrega falló. Los MX{fmtMoney(send.stranded!.amount)} están en tu cuenta · Your dollars were converted but the delivery failed; the pesos are
        in your wallet.
      </Banner>
      <Button
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
      title={<>¡Enviado a {name}!</>}
      amount={r ? `MX${fmtMoney(r.delivered)}` : undefined}
      caption={r ? `llegaron a la wallet de ${name} · arrived on-chain` : undefined}
      action={
        <Button
          variant="dark"
          className="w-full"
          onClick={() => {
            s.send.reset();
            s.setAmount("");
            s.setMemo("");
            s.setScreen("inicio");
          }}
        >
          Listo · Done
        </Button>
      }
    >
      {r && (
        <div className="grid gap-3">
          {r.memo && <p className="mx-auto w-fit rounded-[18px] rounded-bl-[4px] bg-[var(--m-accent-container)] px-4 py-2 text-[15px] text-[#7a3400]">&ldquo;{r.memo}&rdquo;</p>}
          <DetailRows
            rows={[
              { label: "Enviaste", value: `US${fmtMoney(r.amountIn)}` },
              { label: "Tipo aplicado", value: `${fmtNumber(Number(r.delivered) / Number(r.amountIn), 4)} MXN` },
              {
                label: "Comprobante",
                value: (
                  <a href={r.steps.at(-1)?.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[#b45309]">
                    {r.steps.at(-1)?.hash.slice(0, 10)}… <ExternalLink className="size-3.5" />
                  </a>
                ),
                sub: "Tempo testnet",
              },
            ]}
          />
          <p className="text-center text-[13px] text-[var(--m-on-surface-variant)]">Entrega on-chain. Sin retiro a banco (SPEI) en este prototipo.</p>
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
      <TopAppBar
        title={airtime ? "Recargar Tiempo Aire" : "Pagar servicios"}
        sub={airtime ? "Telcel airtime top-up" : "CFE electricity bill"}
        onBack={inFlight ? undefined : () => (bill.reset(), s.setScreen("inicio"))}
      />
      {inFlight && <LinearProgress className="rounded-none" />}
      <div className="grid gap-4 px-4 pt-1 pb-4">
        <div className="flex items-center gap-3">
          <BrandTile id={airtime ? "telcel" : "cfe"} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px]">{airtime ? "Telcel" : "CFE · Luz"}</p>
            <p className="text-[13px] text-[var(--m-on-surface-variant)]">Sin afiliación · not affiliated</p>
          </div>
          <DemoBadge>SIMULATED</DemoBadge>
        </div>
        <Banner tone="info">
          SIMULADO · SIMULATED: el pago es real en Tempo; {airtime ? "la recarga" : "el pago al proveedor"} no se entrega · the payment is real, the{" "}
          {airtime ? "top-up" : "bill payment"} is not delivered.
        </Banner>
        <label className="relative grid">
          <span className="absolute -top-2 left-3 bg-[var(--m-surface)] px-1 text-[12.5px] text-[var(--m-on-surface-variant)]">
            {airtime ? "Número Telcel (10 dígitos)" : "Número de servicio CFE (12 dígitos)"}
          </span>
          <span className="flex h-14 items-center gap-3 rounded-[4px] border border-[var(--m-outline)] px-4 focus-within:border-2 focus-within:border-[var(--m-accent)]">
            {airtime ? <Phone className="size-5 text-[var(--m-on-surface-variant)]" /> : <Lightbulb className="size-5 text-[var(--m-on-surface-variant)]" />}
            <input
              inputMode="numeric"
              value={airtime ? phone : service}
              disabled={inFlight}
              onChange={(e) => change(() => (airtime ? setPhone : setService)(e.target.value.replace(/\D/g, "").slice(0, airtime ? 10 : 12)))}
              placeholder={airtime ? "55 1234 5678" : "123456789012"}
              className="m-num h-full flex-1 bg-transparent text-[16px] outline-none"
            />
          </span>
        </label>
        <div>
          <p className="mb-2 text-[14px] text-[var(--m-on-surface-variant)]">Monto · amount (MXN)</p>
          <div className="flex flex-wrap gap-2">
            {amounts.map((a) => (
              <Chip key={a} selected={mxn === a} disabled={inFlight} onClick={() => change(() => setMxn(a))}>
                ${a}
              </Chip>
            ))}
          </div>
        </div>
        {bill.quote && (
          <div className="rounded-[16px] bg-[var(--m-surface-1)] p-4">
            <p className="text-[13px] text-[var(--m-on-surface-variant)]">{bill.quote.description}</p>
            <p className="m-num mt-1 text-[28px] leading-tight">MX{fmtMoney(BigInt(bill.quote.amount))}</p>
            <p className="text-[13px] text-[var(--m-on-surface-variant)]">Pagas en xMXN · saldo MX{fmtMoney(bal.xmxn)}</p>
            {short && (
              <div className="mt-3 grid gap-2">
                <p className="text-[13px] text-[var(--m-on-surface-variant)]">Necesitas pesos para pagar · convert some dollars first.</p>
                <Button
                  variant="dark"
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
            {bill.stage === "quoting" ? "Cotizando…" : "Continuar · Get quote"}
          </Button>
        ) : (
          <Button className="w-full" loading={inFlight} disabled={!bill.canPay || inFlight || short} onClick={() => bill.pay()}>
            {inFlight ? `${STAGE_ES[bill.stage] ?? "Pagando"}…` : `Pagar MX${fmtMoney(BigInt(bill.quote.amount))}`}
          </Button>
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
  const telcel = r.fulfillment?.providerName?.toLowerCase().includes("telcel") ?? s.screen === "aire";
  return (
    <SuccessScreen
      title="¡Pagado!"
      amount={`MX${fmtMoney(BigInt(r.receipt.amount))}`}
      caption="Pago real en Tempo · recarga SIMULATED"
      action={
        <Button
          variant="dark"
          className="w-full"
          onClick={() => {
            s.bill.reset();
            s.setScreen("inicio");
          }}
        >
          Listo · Done
        </Button>
      }
    >
      <DetailRows
        rows={[
          { label: "Proveedor", value: <span className="inline-flex items-center gap-2"><BrandLogo id={telcel ? "telcel" : "cfe"} height={telcel ? 13 : 22} /></span>, sub: "SIMULATED: no se entrega" },
          {
            label: "Pago",
            value: (
              <a href={r.receipt.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[#b45309]">
                {r.receipt.txHash.slice(0, 10)}… <ExternalLink className="size-3.5" />
              </a>
            ),
            sub: "Real, on Tempo (MPP 402)",
          },
          ...(r.fulfillment ? [{ label: "Referencia", value: <span className="font-mono">{r.fulfillment.reference}</span> }] : []),
        ]}
      />
    </SuccessScreen>
  );
}

