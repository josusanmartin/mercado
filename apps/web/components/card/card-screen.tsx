"use client";
// Mercado Card (crew/DESIGN-ECOSYSTEM.md §6): the cardholder's phone (virtual card, real freeze, real
// daily limit and spending allowance, real transaction history) beside the shop's POS terminal.
// A charge: the POS proposes exact terms → the holder approves on the phone (EIP-712 tap signature,
// mandatory) → the terminal submits it → xMXN moves on-chain → receipt on both sides.
// Simulated and labeled: only the card network and number (CARD_LABEL). Everything else is real.
import { useEffect, useMemo, useState } from "react";
import { createWalletClient, http, parseEventLogs, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useConnection, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Lock, Snowflake, Store, X } from "lucide-react";
import { activeAddresses, explorerTx, mercadoCardAbi, tempoModerato, TEMPO_RPC_URL } from "@mercado/shared";
import {
  ADDR,
  CARD_ENABLED,
  CARD_LABEL,
  CHAIN_ID,
  newTap,
  readableError,
  useBalances,
  useCardActions,
  useCardStats,
  useCards,
  usePool,
  type Tap,
} from "@/lib/contracts";
import { useReportBusy } from "@/lib/busy";
import { fmtAmount, shortAddr, toUnits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel, PhoneFrame, PhoneKeypad, Row, Rows, SettingsLayout } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { BottomSheet, Button as MButton } from "@/components/mobile";
import { personaById } from "@/components/wallet/personas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const VIOLET = "#7c5cff";
const shop = personaById("merchant");

/** Who holds the card on this page: Familia (default) or the driver (?holder=driver, or arriving as Driver). */
type HolderId = "recipient" | "driver";
const HOLDERS: Record<HolderId, { persona: "recipient" | "driver"; hello: string; onCard: string }> = {
  recipient: { persona: "recipient", hello: "Mamá", onCard: "Familia (MX)" },
  driver: { persona: "driver", hello: "Javier", onCard: "Javier · Driver" },
};
/** On-chain merchant names are ASCII; show them properly. */
const merchantLabel = (name?: string) => (name ? name.replace(/\bDona\b/g, "Doña").replace(" - ", " · ") : undefined);

function useHolderId(): HolderId {
  const { address } = useConnection();
  const [id, setId] = useState<HolderId>("recipient");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("holder");
    if (q === "driver" || q === "recipient") setId(q);
    else if (address && address.toLowerCase() === personaById("driver").address?.toLowerCase()) setId("driver");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return id;
}

export function CardScreen() {
  const stats = useCardStats(shop.address);
  const holderId = useHolderId();
  const holder = HOLDERS[holderId];
  return (
    <SettingsLayout
      title="Spend xMXN at the corner store"
      demo={holder.persona}
    >
      {!CARD_ENABLED ? (
        <Panel title="Mercado Card runs on Mercado v2" description="The card settles in v2 xMXN, so it switches on when the app moves to v2. Its contract is already live on Moderato.">
          <Rows>
            <Row
              label="MercadoCard contract"
              value={
                <a className="font-mono text-[13px] hover:underline" href={`https://explore.testnet.tempo.xyz/address/${safeV2Card()}`} target="_blank" rel="noreferrer">
                  {shortAddr(safeV2Card())}
                </a>
              }
            />
          </Rows>
        </Panel>
      ) : (
        <ConnectGate persona={holder.persona} why="The card belongs to the cardholder's wallet. Use the demo account or connect your own.">
          <CardDemo holderId={holderId} />
        </ConnectGate>
      )}
    </SettingsLayout>
  );
}

function safeV2Card() {
  try {
    return activeAddresses("v2").card ?? "";
  } catch {
    return "";
  }
}

type Pending = { tap: Tap; status: "asking" | "signing" | "charging" | "done" | "declined" | "error"; error?: string; hash?: Hex; chargeId?: bigint };

function CardDemo({ holderId }: { holderId: HolderId }) {
  const { address } = useConnection();
  const [pending, setPending] = useState<Pending>();
  const terminal = useTerminal();
  const actions = useCardActions();
  const busy = !!pending && (pending.status === "signing" || pending.status === "charging");
  useReportBusy(busy || actions.tx.isBusy);

  async function approve() {
    if (!pending) return;
    try {
      setPending({ ...pending, status: "signing" });
      const sig = await actions.signTap(pending.tap);
      setPending((p) => p && { ...p, status: "charging" });
      const r = await terminal.charge(pending.tap, sig);
      setPending((p) => p && { ...p, status: "done", hash: r.hash, chargeId: r.chargeId });
    } catch (e) {
      setPending((p) => p && { ...p, status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[360px_minmax(0,1fr)] xl:gap-10">
      <div className="-mx-4 sm:mx-0">
        <PhoneFrame label="Cardholder phone, Android preview" accent={VIOLET}>
          <HolderApp holderId={holderId} holder={address} pending={pending} onApprove={approve} onDecline={() => setPending((p) => p && { ...p, status: "declined" })} />
        </PhoneFrame>
      </div>
      <div className="grid content-start gap-10">
        <Terminal holder={address} pending={pending} setPending={setPending} refund={terminal.refund} />
        <Activity holder={address} />
        <Panel title="What's real here">
          <Rows>
            <Row label="Charges, refunds, limit, freeze" sub="MercadoCard on Tempo; every charge needs the holder's signed tap for its exact amount and shop" value={<Badge variant="success">Real</Badge>} />
            <Row label="Card network and number" sub={CARD_LABEL} value={<Badge variant="mock">Simulated</Badge>} />
            <Row label="Money" sub="Testnet xMXN, no real value; not redeemable for pesos" value={<Badge variant="secondary">Testnet</Badge>} />
          </Rows>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- holder phone

function HolderApp({
  holderId,
  holder,
  pending,
  onApprove,
  onDecline,
}: {
  holderId: HolderId;
  holder?: Address;
  pending?: Pending;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const { cards, allowance, isLoading } = useCards();
  const bal = useBalances();
  const pool = usePool();
  const who = HOLDERS[holderId];
  const a = useCardActions();
  const card = cards.at(-1);
  const [limit, setLimit] = useState<number>();
  useEffect(() => {
    if (card && limit === undefined) setLimit(Number(card.dailyLimit) / 1e6);
  }, [card, limit]);
  const busy = a.tx.isBusy;

  return (
    <div className="relative flex min-h-full flex-col bg-white px-4 pb-6 text-[#111418]">
      <div className="pt-3">
        <p className="text-[13px] text-[#5b6270]">Mi tarjeta · My card</p>
        <p className="text-xl font-semibold">Hola, {who.hello}</p>
      </div>

      {isLoading ? (
        <p className="mt-6 flex items-center gap-2 text-[15px] text-[#5b6270]">
          <Loader2 className="size-4 animate-spin" /> Cargando tarjeta…
        </p>
      ) : !card ? (
        <div className="mt-6 grid gap-3">
          <p className="text-[15px]">Aún no tienes tarjeta · No card yet.</p>
          <button type="button" disabled={busy} onClick={() => a.issueCard(toUnits("1000"))} className="h-12 rounded-[12px] text-[16px] font-semibold text-white disabled:opacity-40" style={{ background: VIOLET }}>
            {busy ? "Emitiendo…" : "Emitir tarjeta virtual · Issue card"}
          </button>
        </div>
      ) : (
        <>
          <CardFront last4={card.last4} frozen={card.frozen} name={who.onCard} />
          <p className="mt-2 text-[13px] text-[#5b6270]">{CARD_LABEL}.</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[13px] text-[#5b6270]">Saldo · balance</p>
              <p className="text-xl font-semibold tabular">{fmtAmount(bal.xmxn)} xMXN</p>
            </div>
            <div>
              <p className="text-[13px] text-[#5b6270]">Disponible hoy · left today</p>
              <p className="text-xl font-semibold tabular">{fmtAmount(card.availableToday)} xMXN</p>
              <p className="text-[13px] text-[#5b6270] tabular">
                {fmtAmount(card.spentToday, 0)} / {fmtAmount(card.dailyLimit, 0)} gastado
              </p>
            </div>
          </div>

          {holderId === "driver" && (
            <p className="mt-3 flex justify-between rounded-[12px] bg-[#f4f5f7] px-3 py-2 text-[15px]">
              <span>Adelanto pendiente · advance owed</span>
              <span className="font-semibold tabular">{pool.debt === undefined ? "—" : `${fmtAmount(pool.debt)} xMXN`}</span>
            </p>
          )}

          <div className="mt-4 grid gap-3 border-t border-[#e6e8ec] pt-4">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[15px] font-semibold">Congelar · Freeze</span>
                <span className="block text-[13px] text-[#5b6270]">Blocks every charge until you unfreeze</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={card.frozen}
                disabled={busy}
                onClick={() => a.setFrozen(card.cardId, !card.frozen)}
                className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50", card.frozen ? "" : "bg-[#d5d9e0]")}
                style={card.frozen ? { background: VIOLET } : undefined}
              >
                <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left] duration-150", card.frozen ? "left-[22px]" : "left-0.5")} />
              </button>
            </label>
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <span>
                  <span className="block text-[15px] font-semibold">Límite diario · Daily limit</span>
                  <span className="block text-[13px] text-[#5b6270]">Se reinicia a medianoche (CDMX) · resets at midnight CDMX</span>
                </span>
                <span className="text-[15px] font-semibold tabular">{limit === undefined ? "—" : `${limit.toLocaleString("en-US")} xMXN`}</span>
              </div>
              <input
                type="range"
                min={100}
                max={5000}
                step={100}
                value={limit ?? 0}
                disabled={busy}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full accent-[#7c5cff]"
                aria-label="Daily limit in xMXN"
              />
              {limit !== undefined && toUnits(String(limit)) !== card.dailyLimit && (
                <button type="button" disabled={busy} onClick={() => a.setDailyLimit(card.cardId, toUnits(String(limit)))} className="h-10 rounded-[10px] bg-[#111418] text-[15px] font-semibold text-white disabled:opacity-40">
                  Guardar límite · Save
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 text-[13px] text-[#5b6270]">
              <span>Permitido gastar · spending allowance: {fmtAmount(allowance, 0)} xMXN</span>
              <button type="button" disabled={busy} onClick={() => a.approveSpending(card.dailyLimit * 2n)} className="shrink-0 font-semibold text-[#111418] underline-offset-4 hover:underline disabled:opacity-40">
                Ajustar
              </button>
            </div>
            {a.tx.isBusy && (
              <p className="flex items-center gap-2 text-[13px] text-[#5b6270]">
                <Loader2 className="size-3.5 animate-spin" /> {a.tx.stepLabel}…
              </p>
            )}
            {a.tx.status === "error" && a.tx.error && <p className="text-[13px] text-[#d92d20]">{a.tx.error}</p>}
          </div>
        </>
      )}

      {pending && pending.tap.holder.toLowerCase() === holder?.toLowerCase() && <TapPrompt key={pending.tap.merchantRef} pending={pending} onApprove={onApprove} onDecline={onDecline} />}
    </div>
  );
}

function CardFront({ last4, frozen, name }: { last4: number; frozen: boolean; name: string }) {
  return (
    <div className="relative mt-4 aspect-[1.586] overflow-hidden rounded-[18px] p-5 text-white" style={{ background: VIOLET }}>
      <div className="flex items-start justify-between">
        <span className="text-lg font-bold tracking-tight">Mercado</span>
        <span className="rounded-md bg-white/20 px-2 py-0.5 text-[13px] font-medium">Demo</span>
      </div>
      <p className="absolute bottom-12 left-5 font-mono text-lg tracking-widest tabular">5x•• •••• •••• {String(last4).padStart(4, "0")}</p>
      <div className="absolute right-5 bottom-4 left-5 flex items-end justify-between text-[13px]">
        <span>{name}</span>
        <span>xMXN</span>
      </div>
      {frozen && (
        <div className="absolute inset-0 grid place-items-center bg-[#111418]/55 backdrop-blur-[2px]">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <Snowflake className="size-5" /> Congelada · Frozen
          </span>
        </div>
      )}
    </div>
  );
}

function TapPrompt({ pending, onApprove, onDecline }: { pending: Pending; onApprove: () => void; onDecline: () => void }) {
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
  const close = () => {
    if (status === "asking") onDecline();
    setClosed(key);
  };
  return (
    <BottomSheet open={closed !== key} onClose={close} dismissable={!inFlight}>
      <div className="grid gap-4 px-6" role="group" aria-label="Approve card payment">
        <div>
          <p className="text-[14px] text-[var(--m-on-surface-variant)]">Tienda Doña Mary · CDMX te cobra</p>
          <p className="m-num mt-1 text-[40px] leading-none font-medium">{fmtAmount(tap.amount)} xMXN</p>
        </div>
        {status === "asking" && (
          <div className="grid grid-cols-2 gap-2">
            <MButton variant="tonal" onClick={onDecline}>
              Rechazar
            </MButton>
            <MButton onClick={onApprove}>Aprobar</MButton>
          </div>
        )}
        {inFlight && (
          <MButton loading disabled>
            {status === "signing" ? "Firmando…" : "La tienda está cobrando…"}
          </MButton>
        )}
        {status === "done" && (
          <p className="flex items-center gap-2 text-[16px] font-medium">
            <Check className="size-5" style={{ color: VIOLET }} /> Pagado
            {pending.hash && (
              <a href={explorerTx(pending.hash)} target="_blank" rel="noreferrer" className="ml-auto text-[14px] font-normal text-[var(--m-on-surface-variant)] hover:underline">
                Ver recibo
              </a>
            )}
          </p>
        )}
        {status === "declined" && <p className="text-[15px] text-[var(--m-on-surface-variant)]">Rechazado. No se cobró nada.</p>}
        {status === "error" && <p className="text-[15px] text-[var(--m-error)]">{pending.error}</p>}
        {!inFlight && status !== "asking" && (
          <MButton variant="dark" onClick={close}>
            Cerrar
          </MButton>
        )}
        <p className="flex items-center gap-1.5 text-[13px] text-[var(--m-on-surface-variant)]">
          <Lock className="size-3.5" /> Tu firma cubre solo este monto, esta tienda y este ticket; vence en 2 min.
        </p>
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------- shop terminal

/** The POS signs with the demo merchant key (testnet demo key, no real value). */
function useTerminal() {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const send = async (functionName: "charge" | "refund" | "approve", address: Address, abi: Abi, args: readonly unknown[]) => {
    if (!shop.privateKey) throw new Error("The demo terminal key is missing.");
    const w = createWalletClient({ account: privateKeyToAccount(shop.privateKey), chain: tempoModerato, transport: http(TEMPO_RPC_URL) });
    try {
      const { request } = await client!.simulateContract({ account: w.account, address, abi, functionName, args } as never);
      const hash = await w.writeContract(request as never);
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Reverted on-chain (${hash}).`);
      return { hash, receipt };
    } catch (e) {
      throw new Error(readableError(e));
    }
  };
  return {
    charge: async (tap: Tap, sig: Hex) => {
      const { hash, receipt } = await send("charge", ADDR.card, mercadoCardAbi as Abi, [tap.cardId, tap.amount, tap.merchantRef, tap.nonce, tap.deadline, sig]);
      const ev = parseEventLogs({ abi: mercadoCardAbi as Abi, logs: receipt.logs, eventName: "CardCharged" })[0] as unknown as { args: { chargeId: bigint } } | undefined;
      return { hash, chargeId: ev?.args.chargeId };
    },
    refund: async (chargeId: bigint, amount: bigint) => {
      const xmxnAbi = parseAbiApprove();
      await send("approve", ADDR.xmxn, xmxnAbi, [ADDR.card, amount]);
      return send("refund", ADDR.card, mercadoCardAbi as Abi, [chargeId, amount]);
    },
  };
}

function parseAbiApprove(): Abi {
  return [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }];
}

function Terminal({
  holder,
  pending,
  setPending,
  refund,
}: {
  holder?: Address;
  pending?: Pending;
  setPending: (p: Pending | undefined) => void;
  refund: (chargeId: bigint, amount: bigint) => Promise<{ hash: Hex }>;
}) {
  const stats = useCardStats(shop.address);
  const { cards } = useCards();
  const card = cards.at(-1);
  const [amount, setAmount] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [refundResult, setRefundResult] = useState<{ hash?: Hex; error?: string }>();
  const amt = toUnits(amount);
  const live = pending && (pending.status === "asking" || pending.status === "signing" || pending.status === "charging");

  function charge() {
    if (!card || !holder || !shop.address) return;
    setRefundResult(undefined);
    setPending({ tap: newTap({ cardId: card.cardId, holder, merchant: shop.address, amount: amt, ref: `ticket-${Date.now().toString(36)}` }), status: "asking" });
    setAmount("");
  }

  return (
    <section aria-label="Shop terminal" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[12px] bg-[#111418] text-white">
            <Store className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{merchantLabel(stats.merchantName) ?? "Shop terminal"}</h2>
            <p className="text-muted-foreground text-[13px]">
              Demo merchant terminal {shortAddr(shop.address)} · {stats.merchantActive ? "allowlisted on MercadoCard" : "checking allowlist…"}
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-5 rounded-[20px] bg-[#f4f5f7] p-5 sm:grid-cols-[1fr_15rem] dark:bg-[#1a1d23]">
        <div className="grid content-start gap-3">
          <p className="text-muted-foreground text-[13px]">Total a cobrar · amount</p>
          <p className="text-[2.6rem] leading-none font-semibold tabular">
            {amount || "0"} <span className="text-muted-foreground text-lg font-medium">xMXN</span>
          </p>
          <Button size="lg" disabled={!card || amt === 0n || !!live} onClick={charge} style={{ background: VIOLET }} className="text-white">
            {live ? <Loader2 className="animate-spin" /> : null}
            {live ? "Esperando al cliente · waiting for the tap" : "Cobrar con Mercado Card"}
          </Button>
          {!card && <p className="text-muted-foreground text-[13px]">The customer needs a card first (issue one on the phone).</p>}
          {pending?.status === "done" && pending.hash && (
            <div className="grid gap-2 rounded-[14px] bg-white p-3 text-[15px] dark:bg-[#0f1115]">
              <p className="flex items-center gap-2 font-semibold">
                <Check className="text-success size-4" /> Cobrado · Charged {fmtAmount(pending.tap.amount)} xMXN
              </p>
              <a href={explorerTx(pending.hash)} target="_blank" rel="noreferrer" className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[13px] hover:underline">
                {pending.hash.slice(0, 14)}… <ExternalLink className="size-3" />
              </a>
              {pending.chargeId !== undefined && (
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  disabled={refunding}
                  onClick={async () => {
                    setRefunding(true);
                    try {
                      const r = await refund(pending.chargeId!, pending.tap.amount);
                      setRefundResult({ hash: r.hash });
                    } catch (e) {
                      setRefundResult({ error: e instanceof Error ? e.message : String(e) });
                    } finally {
                      setRefunding(false);
                    }
                  }}
                >
                  {refunding && <Loader2 className="animate-spin" />}
                  Reembolsar · Refund
                </Button>
              )}
              {refundResult?.hash && (
                <a href={explorerTx(refundResult.hash)} target="_blank" rel="noreferrer" className="text-muted-foreground text-[13px] hover:underline">
                  Refunded on-chain ({refundResult.hash.slice(0, 10)}…)
                </a>
              )}
              {refundResult?.error && <p className="text-destructive text-[13px]">{refundResult.error}</p>}
            </div>
          )}
          {pending?.status === "declined" && (
            <p className="text-muted-foreground flex items-center gap-2 text-[15px]">
              <X className="size-4" /> The customer declined. Nothing was charged.
            </p>
          )}
          {pending?.status === "error" && <p className="text-destructive text-[13px]">{pending.error}</p>}
        </div>
        <PhoneKeypad value={amount} onChange={setAmount} disabled={!!live} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- history

function Activity({ holder }: { holder?: Address }) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const { cards } = useCards();
  const ids = useMemo(() => new Set(cards.map((c) => c.cardId.toString())), [cards]);
  const from = (() => {
    try {
      return BigInt(activeAddresses("v2").startBlock ?? 0);
    } catch {
      return 0n;
    }
  })();
  const q = useQuery({
    queryKey: ["card-activity", ADDR.card, holder],
    enabled: !!client && CARD_ENABLED,
    refetchInterval: 8_000,
    queryFn: async () => {
      const logs = await client!.getLogs({ address: ADDR.card, fromBlock: from, toBlock: "latest" });
      return (parseEventLogs({ abi: mercadoCardAbi as Abi, logs, eventName: ["CardCharged", "CardRefunded"] }) as unknown as {
        eventName: string;
        args: { chargeId: bigint; cardId: bigint; merchant: Address; amount: bigint };
        transactionHash: Hex;
      }[]).reverse();
    },
  });
  const rows = (q.data ?? []).filter((e) => ids.has(e.args.cardId.toString())).slice(0, 8);
  return (
    <Panel title="Card activity" description="Read from CardCharged and CardRefunded events on Tempo.">
      {q.isLoading ? (
        <p className="text-muted-foreground text-[15px]">Reading the chain…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-[15px]">No charges on this card yet.</p>
      ) : (
        <Rows>
          {rows.map((e) => (
            <Row
              key={e.transactionHash + e.eventName}
              label={e.eventName === "CardCharged" ? `Charge #${e.args.chargeId}` : `Refund of #${e.args.chargeId}`}
              sub={`Card ${e.args.cardId} · ${e.args.merchant.toLowerCase() === shop.address?.toLowerCase() ? "Tienda Doña Mary" : shortAddr(e.args.merchant)}`}
              value={
                <a href={explorerTx(e.transactionHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                  {e.eventName === "CardCharged" ? "−" : "+"}
                  {fmtAmount(e.args.amount)} xMXN <ExternalLink className="text-muted-foreground size-3.5" />
                </a>
              }
            />
          ))}
        </Rows>
      )}
    </Panel>
  );
}
