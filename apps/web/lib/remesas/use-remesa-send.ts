"use client";
// Send money home: USD (testnet OUSD) in, pesos (xMXN) delivered to the family's wallet.
// v1: SwapDesk swap, then a (memo) transfer. v2: MoveAMM mints straight to the recipient in one tx
// (or mint-to-self then transferWithMemo when there's a note). One active tx state for whichever
// path runs (R-034); every input is validated before the first write (R-017/R-032); the delivered
// amount is frozen from the confirmed transfer log, never a balance diff (R-020).
import { useCallback, useEffect, useState } from "react";
import { isAddress, zeroAddress, type Address, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import {
  ADDR,
  CHAIN_ID,
  deliveredFromReceipt,
  MEMO_MAX_BYTES,
  memoByteLength,
  readableError,
  useMercado,
  useOracle,
  useSwapQuote,
  useWho,
  withSlippage,
  type TxStep,
} from "@/lib/contracts";
import { USE_V2, V2 } from "@/lib/v2/addresses";
import { useMercadoV2 } from "@/lib/v2/actions";
import { useMoveQuote } from "@/lib/v2/reads";
import { useReportBusy } from "@/lib/busy";
import { explorerTx } from "@mercado/shared";

export const SLIPPAGE_BPS = 50n;
const PENDING_NOTE = "Tu entrega anterior aún se está confirmando en Tempo. No la enviaremos de nuevo hasta que se confirme.";

import { reconcile, type ReconcileClient, type Stranded } from "./reconcile-delivery";
export type { Stranded };
const strandedKey = (a: Address) => `mercado.remesas.stranded.${a.toLowerCase()}`;
function loadStranded(a: Address | undefined, fallbackToken: Address): Stranded | undefined {
  if (!a) return undefined;
  try {
    const raw = localStorage.getItem(strandedKey(a));
    if (!raw) return undefined;
    const v = JSON.parse(raw) as Omit<Stranded, "amount"> & { amount: string };
    if (v.chainId !== undefined && v.chainId !== CHAIN_ID) return undefined; // another network's record
    return { ...v, amount: BigInt(v.amount), chainId: v.chainId ?? CHAIN_ID, token: v.token ?? fallbackToken };
  } catch {
    return undefined;
  }
}
function saveStranded(a: Address, v: Stranded | undefined) {
  try {
    if (v) localStorage.setItem(strandedKey(a), JSON.stringify({ ...v, amount: v.amount.toString() }));
    else localStorage.removeItem(strandedKey(a));
  } catch {}
}

export type SendReceipt = { to: Address; amountIn: bigint; delivered: bigint; memo?: string; steps: TxStep[]; at: number };

export function useRemesaSend(amountIn: bigint) {
  const m1 = useMercado();
  const m2 = useMercadoV2();
  const sendTx = USE_V2 ? m2.tx : m1.tx;
  const me = useWho();
  const client = usePublicClient({ chainId: CHAIN_ID });
  const xmxnToken = (USE_V2 ? V2.xmxn : ADDR.xmxn) ?? ADDR.xmxn;
  const [stranded, setStranded] = useState<Stranded>();
  const [recoveryNote, setRecoveryNote] = useState<string>();
  const [active, setActive] = useState<"send" | "convert" | "recover">("send");
  const tx = active === "recover" ? m1.tx : sendTx;
  useReportBusy(m1.tx.isBusy || m2.tx.isBusy);
  const fx = useOracle();

  const q1 = useSwapQuote(true, !USE_V2 && amountIn > 0n ? amountIn : undefined);
  const q2 = useMoveQuote(true, USE_V2 && amountIn > 0n ? amountIn : undefined);
  const amountOut = USE_V2 ? q2.amountOut : q1.amountOut;
  const fee = USE_V2 ? q2.fee : q1.fee;
  const quoteError = (USE_V2 ? q2.error : q1.error) ? readableError(USE_V2 ? q2.error : q1.error) : undefined;
  const quote = {
    amountOut,
    fee,
    minOut: amountOut !== undefined ? withSlippage(amountOut, SLIPPAGE_BPS) : undefined,
    /** Oracle mid, 8dp (MXN per USD). */
    mid: USE_V2 ? q2.mid : fx.mxnPerUsd,
    impactBps: USE_V2 ? q2.impactBps : undefined,
    loading: USE_V2 ? q2.isLoading : q1.isLoading,
    error: quoteError,
    venue: USE_V2 ? ("Mercado exchange (vAMM)" as const) : ("Swap desk" as const),
  };

  const [receipt, setReceipt] = useState<SendReceipt>();
  // Frozen at send time so a recovery delivers to the same recipient with the same note.
  const [attempt, setAttempt] = useState<{ to: Address; memo?: string; account?: Address }>();

  const send = useCallback(
    async (to: Address, memo?: string) => {
      setReceipt(undefined);
      if (stranded) throw new Error("You have converted pesos waiting for delivery. Deliver them first.");
      if (!isAddress(to) || to === zeroAddress) throw new Error("That recipient address isn't valid.");
      if (memo && memoByteLength(memo) > MEMO_MAX_BYTES) throw new Error("The note is longer than 32 bytes.");
      if (!amountOut) throw new Error("No quote yet.");
      setAttempt({ to, memo });
      setActive("send");
      const steps = USE_V2
        ? memo
          ? await m2.sendUsdToMxnWithMemo(amountIn, amountOut, to, memo, SLIPPAGE_BPS)
          : await m2.sendUsdToMxn(amountIn, amountOut, to, SLIPPAGE_BPS)
        : await m1.swapAndSend(amountIn, amountOut, to, memo, SLIPPAGE_BPS);
      const last = steps?.at(-1);
      if (!last) return undefined;
      const xmxn = (USE_V2 ? V2.xmxn : ADDR.xmxn) ?? ADDR.xmxn;
      const r: SendReceipt = { to, amountIn, delivered: deliveredFromReceipt(last, xmxn, to).amount, memo, steps: steps!, at: Date.now() };
      setReceipt(r);
      return r;
    },
    [amountIn, amountOut, m1, m2, stranded],
  );

  /**
   * Turn dollars into pesos in your own wallet (to pay a bill in xMXN). Spends just enough OUSD at the
   * oracle mid plus a 2% cushion for fees; the min-received check still protects the swap.
   */
  const convert = useCallback(
    async (neededXmxn: bigint, self: Address) => {
      if (stranded) throw new Error("You have converted pesos waiting for delivery. Deliver them first.");
      const mid = fx.mxnPerUsd; // the shared FX oracle (same feed in v1 and v2)
      if (!mid) throw new Error("No exchange rate yet.");
      setActive("convert"); // a mint to yourself on purpose: never a stranded delivery
      const raw = (neededXmxn * 10n ** 8n * 102n) / (mid * 100n);
      const amountUsd = ((raw + 9_999n) / 10_000n) * 10_000n; // round up to the cent
      const estOut = (amountUsd * mid * 98n) / (10n ** 8n * 100n); // conservative expected output
      return USE_V2 ? m2.sendUsdToMxn(amountUsd, estOut, self, SLIPPAGE_BPS) : m1.swap(true, amountUsd, estOut, SLIPPAGE_BPS);
    },
    [fx.mxnPerUsd, m1, m2, stranded],
  );

  /**
   * Recovery (review, R-039): the conversion confirmed but the delivery isn't confirmed, so the pesos sit
   * in (or are leaving) the sender's own wallet. The record is persisted as soon as the conversion
   * confirms, gains the delivery hash the moment one is broadcast, and is shown when the flow fails or
   * after a reload. A delivery is only (re)sent after reconcile() says the earlier one provably didn't land.
   */
  const convertStep = active === "send" ? sendTx.steps.find((st) => st.receipt && /^(Mint xMXN|Swap OUSD)/.test(st.label)) : undefined;
  const sendStep = active === "send" ? sendTx.steps.find((st) => /^Send/.test(st.label)) : undefined;
  const converted = convertStep && me ? deliveredFromReceipt(convertStep, xmxnToken, me).amount : undefined; // 0 when minted straight to the recipient

  // Load (and quietly reconcile) the record for this sender.
  useEffect(() => {
    const v = loadStranded(me, xmxnToken);
    setStranded(v);
    setRecoveryNote(undefined);
    if (!v || !client) return;
    let live = true;
    reconcile(client as unknown as ReconcileClient, v)
      .then((rc) => {
        if (!live) return;
        if (rc.state === "delivered") {
          saveStranded(v.account, undefined);
          setStranded(undefined);
        } else if (rc.state === "pending") setRecoveryNote(PENDING_NOTE);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [me, client, xmxnToken]);

  // Persist from the moment the conversion confirms; add the delivery hash once broadcast; clear on success.
  useEffect(() => {
    if (!convertStep || !converted || !attempt || !me) return;
    if (sendStep?.receipt) {
      saveStranded(me, undefined);
      setStranded(undefined);
      return;
    }
    const v: Stranded = {
      account: me,
      to: attempt.to,
      amount: converted,
      memo: attempt.memo,
      chainId: CHAIN_ID,
      token: xmxnToken,
      convertHash: convertStep.hash,
      fromBlock: convertStep.receipt!.blockNumber.toString(),
      delivery: sendStep ? { hash: sendStep.hash, at: Date.now() } : undefined,
    };
    // Keep when a delivery was first seen (the drop timer must not restart on re-renders).
    const prev = loadStranded(me, xmxnToken);
    if (v.delivery && prev?.delivery?.hash === v.delivery.hash) v.delivery = prev.delivery;
    saveStranded(me, v);
    if (sendTx.status === "error") setStranded(v); // surface it only once the flow has failed
  }, [convertStep, converted, sendStep, attempt, me, xmxnToken, sendTx.status]);

  // Recovery delivery broadcast: record its hash immediately (it may time out before a receipt).
  const recoverStep = active === "recover" ? m1.tx.steps.find((st) => /^Send/.test(st.label)) : undefined;
  useEffect(() => {
    if (!recoverStep || !stranded || stranded.delivery?.hash === recoverStep.hash) return;
    const v: Stranded = { ...stranded, delivery: { hash: recoverStep.hash, at: Date.now() } };
    saveStranded(v.account, v);
    setStranded(v);
  }, [recoverStep, stranded]);

  const deliverStranded = useCallback(async () => {
    if (!stranded || !client) return undefined;
    setActive("recover");
    setRecoveryNote(undefined);
    const done = (hash: Hex, steps: TxStep[], delivered: bigint) => {
      saveStranded(stranded.account, undefined);
      setStranded(undefined);
      const r: SendReceipt = { to: stranded.to, amountIn, delivered, memo: stranded.memo, steps, at: Date.now() };
      setReceipt(r);
      return r;
    };
    const rc = await reconcile(client as unknown as ReconcileClient, stranded);
    if (rc.state === "delivered") return done(rc.hash, [{ label: "Send xMXN", hash: rc.hash, url: explorerTx(rc.hash) }], stranded.amount);
    if (rc.state === "pending") {
      setRecoveryNote(PENDING_NOTE);
      return undefined;
    }
    // Provably not delivered: send exactly the converted amount, once, with the same token and note.
    const steps = await m1.transfer(stranded.token, stranded.to, stranded.amount, stranded.memo);
    const last = steps?.at(-1);
    if (!last) return undefined; // failed or unconfirmed: the record (with its delivery hash) stays for reconciliation
    return done(last.hash, steps ?? [], deliveredFromReceipt(last, stranded.token, stranded.to).amount ?? stranded.amount);
  }, [stranded, client, m1, amountIn]);

  return {
    tx,
    quote,
    send,
    convert,
    receipt,
    stranded,
    deliverStranded,
    /** Spanish, for the phone: shown when an earlier delivery is still settling and nothing is re-sent. */
    recoveryNote,
    reset: () => (setReceipt(undefined), setAttempt(undefined), setActive("send"), m1.tx.reset(), m2.tx.reset()),
  };
}
