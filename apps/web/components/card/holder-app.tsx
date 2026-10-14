"use client";
// Mercado Card: the cardholder's phone (owned by mobile; the POS/terminal and page stay in card-screen.tsx).
// Ink theme (PRINCIPLES: "Card ink on cream"), Spanish only; the English explanations sit in the desktop
// "What's real here" panel (incl. CARD_LABEL). Everything here is real on-chain: the card, freeze, the
// calendar-day limit, the spending allowance, the tap signature and the charge/refund history. Only the
// card network and number are simulated (the "Demo" mark on the card and the meta line under it).
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { type Address, type Hex } from "viem";
import { CircleUserRound, CreditCard, ExternalLink, History, Lock, Snowflake, Store } from "lucide-react";
import { explorerTx } from "@mercado/shared";
import { toUnits } from "@/lib/format";
import { useBalances, useCardActions, useCards, usePool, type Tap } from "@/lib/contracts";
import { useActivityFeed } from "@/lib/contracts/activity";
import { Stagger, TickerText } from "@/lib/motion";
import { useNow } from "@/lib/use-now";
import {
  AccentField,
  AppHeader,
  Avatar,
  BalanceHead,
  BottomNav,
  Banner,
  BottomSheet,
  Button,
  Display,
  ListHeader,
  ListItem,
  LinearProgress,
  Meta,
  Money,
  ScreenTransition,
  Skeleton,
  SuccessCheck,
  Switch,
  useNavDirection,
  useStatusBar,
  fmtMoney,
  haceTiempo,
  type NavItem,
} from "@/components/mobile";

export const CARD_CREAM = "#f2e6c9";

/** Spanish in the phone for the shared English error sentences that reach it (lib/contracts/errors.ts). */
const phoneError = (e?: string) => (e && /allowance is too low/i.test(e) ? "Tu autorización de gasto es muy baja. Autoriza primero." : e);

export type Pending = { tap: Tap; status: "asking" | "signing" | "charging" | "done" | "declined" | "error"; error?: string; hash?: Hex; chargeId?: bigint };

export function HolderApp({
  who,
  holder,
  showAdvance,
  pending,
  onApprove,
  onDecline,
  merchantName = "Tienda Doña Mary · CDMX",
}: {
  who: { hello: string; onCard: string };
  holder?: Address;
  /** The driver's card also shows what they owe the credit pool. */
  showAdvance?: boolean;
  pending?: Pending;
  onApprove: () => void;
  onDecline: () => void;
  merchantName?: string;
}) {
  const { cards, allowance, isLoading } = useCards();
  const bal = useBalances();
  const pool = usePool();
  const a = useCardActions();
  const card = cards.at(-1);
  const busy = a.tx.isBusy;
  const [limitOpen, setLimitOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("tarjeta");
  const dir = useNavDirection(tab, TAB_ORDER);
  useStatusBar(CARD_CREAM);

  return (
    <div className="relative flex min-h-full flex-col">
      {busy && <LinearProgress className="absolute inset-x-0 top-0 z-20" />}
      {/* Persistent on every tab and state (R-051): index, product and the full honesty line. */}
      {/* v5 ink world on cream: a cream band holds the header and the tab's title (ink text, 16:1) and stays
          put like an Android top app bar; the content under it slides between tabs. The cream card then sits on ink. */}
      <AccentField color={CARD_CREAM} className="pb-4">
        <AppHeader index="05" product="Tarjeta" right={<Avatar name={who.hello} size={36} />} />
        <Display as="h1" size={40} className="px-4 pt-1">
          {tab === "tarjeta" ? `Hola, ${who.hello}` : tab === "actividad" ? "Actividad" : "Perfil"}
        </Display>
      </AccentField>
      <ScreenTransition id={tab} dir={dir} className="flex-1 pb-6">
        {tab === "actividad" && (
          <>
            <div className="h-2" />
            <CardActivity holder={holder} merchantName={merchantName} limit={30} />
          </>
        )}
        {tab === "perfil" && <Perfil who={who} holder={holder} last4={card?.last4} />}
        {tab === "tarjeta" && (
          <>
            {isLoading ? (
              <div className="mt-6 px-4">
                <Skeleton className="aspect-[1.586] w-full rounded-[8px]" />
              </div>
            ) : !card ? (
              <div className="mt-6 grid gap-4 px-4">
                <p className="text-[16px]">Aún no tienes tarjeta.</p>
                <Button variant="accent" loading={busy} disabled={busy} onClick={() => a.issueCard(toUnits("1000"))}>
                  Emitir tarjeta virtual
                </Button>
              </div>
            ) : (
              <>
                <div className="mt-6 px-4">
                  <CardFront last4={card.last4} frozen={card.frozen} name={who.onCard} />
                  <Meta honesty className="mt-2">
                    Tarjeta virtual demo · no es Visa/Mastercard · solo comercios demo
                  </Meta>
                </div>

                <section className="mt-6 px-4" aria-label="Saldo">
                  <BalanceHead label="Saldo" />
                  <Money value={bal.xmxn} currency="MXN" size={52} className="mt-2" />
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between">
                      <Meta>Disponible hoy</Meta>
                      <TickerText className="m-num text-[15px] font-semibold" text={`MX${fmtMoney(card.availableToday)}`} />
                    </div>
                    <div className="mt-2 h-1.5 w-full bg-[var(--m-surface-3)]" aria-hidden>
                      <div
                        className="h-full w-full origin-left transition-transform duration-[420ms] ease-[cubic-bezier(.2,.8,.2,1)]"
                        style={{
                          transform: `scaleX(${card.dailyLimit > 0n ? Math.min(100, Number((card.spentToday * 100n) / card.dailyLimit)) / 100 : 0})`,
                          background: CARD_CREAM,
                        }}
                      />
                    </div>
                    <Meta className="mt-1.5">
                      {fmtMoney(card.spentToday, 0)} de {fmtMoney(card.dailyLimit, 0)} gastado · se reinicia a medianoche (CDMX)
                    </Meta>
                  </div>
                  {showAdvance && (
                    <div className="mt-4 flex items-baseline justify-between border-t border-[var(--m-outline-variant)] pt-3">
                      <span className="text-[15px]">Adelanto pendiente</span>
                      <TickerText className="m-num text-[15px] font-semibold" text={pool.debt === undefined ? "—" : `MX${fmtMoney(pool.debt)}`} />
                    </div>
                  )}
                </section>

                <ListHeader>Controles</ListHeader>
                <div className="border-t border-[var(--m-outline-variant)]">
                  <div className="flex min-h-16 items-center gap-3.5 border-b border-[var(--m-outline-variant)] px-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--m-outline-variant)]">
                      <Snowflake className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-medium">Congelar</span>
                      <span className="block text-[13.5px] text-[var(--m-on-surface-variant)]">{card.frozen ? "Congelada: se rechaza todo cobro" : "Bloquea todo cobro al instante"}</span>
                    </span>
                    <Switch checked={card.frozen} disabled={busy} label="Congelar · Freeze" onChange={(v) => a.setFrozen(card.cardId, v)} />
                  </div>
                  <ListItem
                    divider
                    leading={<RowGlyph>≤</RowGlyph>}
                    headline="Límite diario"
                    supporting="Se reinicia a medianoche (CDMX)"
                    trailing={<TickerText text={`MX${fmtMoney(card.dailyLimit, 0)}`} />}
                    onClick={() => setLimitOpen(true)}
                    disabled={busy}
                  />
                  <ListItem
                    divider
                    leading={<RowGlyph>✓</RowGlyph>}
                    headline="Permiso de gasto"
                    supporting="Lo que la tarjeta puede mover de tu saldo"
                    trailing={<TickerText text={`MX${fmtMoney(allowance, 0)}`} />}
                    onClick={() => a.approveSpending(card.dailyLimit * 2n)}
                    disabled={busy}
                  />
                </div>
                {a.tx.status === "error" && a.tx.error && (
                  <div className="px-4 pt-3">
                    <Banner tone="error">{phoneError(a.tx.error)}</Banner>
                  </div>
                )}

                <ListHeader
                  action={
                    <button type="button" onClick={() => setTab("actividad")} className="m-meta h-8 text-[var(--m-on-surface)] underline underline-offset-4">
                      Ver todo
                    </button>
                  }
                >
                  Movimientos
                </ListHeader>
                <CardActivity holder={holder} merchantName={merchantName} limit={3} />

                <LimitSheet
                  open={limitOpen}
                  onClose={() => setLimitOpen(false)}
                  current={Number(card.dailyLimit) / 1e6}
                  busy={busy}
                  onSave={async (v) => {
                    await a.setDailyLimit(card.cardId, toUnits(String(v)));
                    setLimitOpen(false);
                  }}
                />
              </>
            )}
          </>
        )}
      </ScreenTransition>
      <BottomNav items={TABS} value={tab} onChange={setTab} />

      {pending && pending.tap.holder.toLowerCase() === holder?.toLowerCase() && (
        <TapPrompt key={pending.tap.merchantRef} pending={pending} merchantName={merchantName} onApprove={onApprove} onDecline={onDecline} />
      )}
    </div>
  );
}

type Tab = "tarjeta" | "actividad" | "perfil";
const TAB_ORDER: readonly Tab[] = ["tarjeta", "actividad", "perfil"];
const TABS: NavItem<Tab>[] = [
  { id: "tarjeta", label: "Tarjeta", icon: <CreditCard /> },
  { id: "actividad", label: "Actividad", icon: <History /> },
  { id: "perfil", label: "Perfil", icon: <CircleUserRound /> },
];

function Perfil({ who, holder, last4 }: { who: { hello: string; onCard: string }; holder?: Address; last4?: number }) {
  return (
    <div>
      <div className="flex items-center gap-4 px-4 pt-4 pb-5">
        <Avatar name={who.hello} size={64} />
        <div className="min-w-0">
          <Display size={24}>{who.onCard}</Display>
          <p className="mt-1 font-mono text-[13px] text-[var(--m-on-surface-variant)]">{holder ? `${holder.slice(0, 6)}…${holder.slice(-4)}` : "—"}</p>
        </div>
      </div>
      <div className="border-t border-[var(--m-outline-variant)]">
        <ListItem
          divider
          leading={<RowGlyph>▭</RowGlyph>}
          headline="Tarjeta virtual"
          supporting={last4 !== undefined ? `Terminación ${String(last4).padStart(4, "0")} · número demo` : "Sin tarjeta"}
        />
        <ListItem divider leading={<RowGlyph>⛓</RowGlyph>} headline="Red" supporting="Tempo Moderato · testnet" />
        {holder && (
          <ListItem
            divider
            leading={<RowGlyph>↗</RowGlyph>}
            headline="Mi cuenta en el explorador"
            supporting="explore.testnet.tempo.xyz"
            href={`https://explore.testnet.tempo.xyz/address/${holder}`}
          />
        )}
      </div>
      <Meta honesty className="mt-5 px-4">
        Tarjeta demo · no es Visa/Mastercard · testnet · sin valor real · no canjeable
      </Meta>
    </div>
  );
}

const RowGlyph = ({ children }: { children: string }) => (
  <span className="m-display grid size-10 shrink-0 place-items-center rounded-full border border-[var(--m-outline-variant)] text-[16px]">{children}</span>
);

/**
 * The card: flat cream, ink type, Mercado wordmark, no network marks. v5: a subtle tilt toward the pointer on
 * hover (desktop pointers only, ≤4°, transform only; none under reduced motion, see mobile.css .m-tilt).
 */
function CardFront({ last4, frozen, name }: { last4: number; frozen: boolean; name: string }) {
  const tilt = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--tx", `${(((e.clientY - r.top) / r.height - 0.5) * -6).toFixed(2)}deg`);
    e.currentTarget.style.setProperty("--ty", `${(((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(2)}deg`);
  };
  return (
    <div
      className="m-tilt relative aspect-[1.586] overflow-hidden rounded-[8px] p-5 text-[#0a0a0a]"
      onPointerMove={tilt}
      onPointerLeave={(e) => (e.currentTarget.style.removeProperty("--tx"), e.currentTarget.style.removeProperty("--ty"))}
      style={{ background: CARD_CREAM }}
      role="img"
      aria-label={`Tarjeta Mercado terminación ${last4}${frozen ? ", congelada" : ""}`}
    >
      <span aria-hidden className="absolute -right-10 -bottom-16 size-52 rounded-full border-[18px] border-[#e2603f]/80" />
      <span aria-hidden className="absolute -right-2 -bottom-8 size-28 rounded-full bg-[#1f3d2b]" />
      <div className="relative flex items-start justify-between">
        <span className="m-display text-[26px]">Mercado</span>
        <span data-honesty className="rounded-[2px] border border-[#0a0a0a]/40 px-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
          Demo
        </span>
      </div>
      <p className="m-num absolute bottom-12 left-5 text-[18px] font-medium tracking-[0.14em]">5x•• •••• •••• {String(last4).padStart(4, "0")}</p>
      <div className="absolute bottom-4 left-5 text-[11.5px] font-semibold tracking-[0.08em] uppercase">{name}</div>
      <div className="absolute right-5 bottom-4 text-[11.5px] font-semibold tracking-[0.08em] text-[#f2e6c9] uppercase">xMXN</div>
      {frozen && (
        <div className="absolute inset-0 grid place-items-center bg-[#0a0a0a]/70">
          <span className="m-display flex items-center gap-2 text-[22px] text-[#f2e6c9]">
            <Snowflake className="size-6" /> Congelada
          </span>
        </div>
      )}
    </div>
  );
}

function CardActivity({ holder, merchantName, limit = 6 }: { holder?: Address; merchantName: string; limit?: number }) {
  const feed = useActivityFeed("card", { account: holder, limit: 40 });
  const now = useNow(30_000) ?? 0;
  const rows = feed.rows.filter((r) => r.event === "CardCharged" || r.event === "CardRefunded");
  if (feed.isLoading && rows.length === 0)
    return (
      <div className="grid gap-3 px-4 py-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  if (rows.length === 0) return <Meta className="px-4 py-3">Aún no hay cobros con esta tarjeta</Meta>;
  return (
    <Stagger className="border-t border-[var(--m-outline-variant)]">
      {rows.slice(0, limit).map((r) => {
        const refund = r.event === "CardRefunded";
        return (
          <ListItem
            key={r.txHash + r.logIndex}
            divider
            href={r.url}
            leading={
              <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: CARD_CREAM, color: "#0a0a0a" }}>
                <Store className="size-5" strokeWidth={1.75} />
              </span>
            }
            headline={refund ? "Reembolso" : merchantName.split(" · ")[0]}
            supporting={`${refund ? merchantName.split(" · ")[0] : "Compra con tarjeta"} · ${r.timestamp ? haceTiempo(r.timestamp, now) : "en la cadena"}`}
            trailing={`${refund ? "+" : "−"}MX${fmtMoney(r.amount)}`}
            trailingTone={refund ? "in" : undefined}
          />
        );
      })}
    </Stagger>
  );
}

function LimitSheet({ open, onClose, current, busy, onSave }: { open: boolean; onClose: () => void; current: number; busy: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(current);
  useEffect(() => {
    if (open) setV(current);
  }, [open, current]);
  return (
    <BottomSheet open={open} onClose={onClose} dismissable={!busy} title="Límite diario" sub="Se reinicia a medianoche (CDMX)">
      <div className="grid gap-5 px-6">
        <Display size={48} fit>
          MX{fmtMoney(v, 0)}
        </Display>
        <input
          type="range"
          min={100}
          max={5000}
          step={100}
          value={v}
          disabled={busy}
          onChange={(e) => setV(Number(e.target.value))}
          className="w-full accent-[#f2e6c9]"
          aria-label="Límite diario en xMXN"
        />
        <div className="flex justify-between">
          <Meta>MX$100</Meta>
          <Meta>MX$5,000</Meta>
        </div>
        <Button variant="accent" loading={busy} disabled={busy || v === current} onClick={() => onSave(v)}>
          Guardar límite
        </Button>
      </div>
    </BottomSheet>
  );
}

function TapPrompt({ pending, merchantName, onApprove, onDecline }: { pending: Pending; merchantName: string; onApprove: () => void; onDecline: () => void }) {
  const { tap, status } = pending;
  const key = tap.merchantRef;
  const [closed, setClosed] = useState<string>();
  const inFlight = status === "signing" || status === "charging";
  // A settled prompt never blocks the card controls: Cerrar / swipe-down / scrim in every non-in-flight
  // state, and a paid one closes itself (qa P1: a frozen-card error used to pin it for 2 minutes).
  useEffect(() => {
    if (status !== "done") return;
    const t = setTimeout(() => setClosed(key), 2500);
    return () => clearTimeout(t);
  }, [status, key]);
  // Read the CURRENT status at dismiss time: a dismiss racing with Aprobar must never decline the tap.
  const statusNow = useRef(status);
  statusNow.current = status;
  const close = () => {
    if (statusNow.current === "signing" || statusNow.current === "charging") return;
    if (statusNow.current === "asking") onDecline();
    setClosed(key);
  };
  return (
    <BottomSheet open={closed !== key} onClose={close} dismissable={!inFlight} sub={`${merchantName} te cobra`} ariaLabel="Approve card payment">
      <div className="grid gap-5 px-6">
        <Display size={52} fit>
          MX{fmtMoney(tap.amount)}
        </Display>
        {status === "asking" && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outlined" onClick={onDecline}>
              Rechazar
            </Button>
            <Button variant="accent" onClick={onApprove}>
              Aprobar
            </Button>
          </div>
        )}
        {inFlight && (
          <Button variant="accent" loading disabled>
            {status === "signing" ? "Firmando…" : "La tienda está cobrando…"}
          </Button>
        )}
        {status === "done" && (
          <p className="flex items-center gap-3 text-[16px] font-semibold">
            <span aria-hidden className="inline-grid">
              <SuccessCheck size={40} />
            </span>
            Pagado
            {pending.hash && (
              <a href={explorerTx(pending.hash)} target="_blank" rel="noreferrer" className="m-meta ml-auto inline-flex items-center gap-1 text-[var(--m-on-surface)] underline underline-offset-4">
                Ver recibo <ExternalLink className="size-3" />
              </a>
            )}
          </p>
        )}
        {status === "declined" && <p className="text-[16px]">Rechazado. No se cobró nada.</p>}
        {status === "error" && <Banner tone="error">{phoneError(pending.error)}</Banner>}
        {!inFlight && status !== "asking" && <Button onClick={close}>Cerrar</Button>}
        <Meta className="flex items-start gap-1.5">
          <Lock className="mt-px size-3 shrink-0" /> Tu firma cubre solo este monto, esta tienda y este ticket · vence en 2 min
        </Meta>
      </div>
    </BottomSheet>
  );
}
