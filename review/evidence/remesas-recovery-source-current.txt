"use client";
// Send money home: USD (testnet OUSD) in, pesos (xMXN) delivered to the family's wallet.
// v1: SwapDesk swap, then a (memo) transfer. v2: MoveAMM mints straight to the recipient in one tx
// (or mint-to-self then transferWithMemo when there's a note). One active tx state for whichever
// path runs (R-034); every input is validated before the first write (R-017/R-032); the delivered
// amount is frozen from the confirmed transfer log, never a balance diff (R-020).
import { useCallback, useEffect, useState } from "react";
import { isAddress, zeroAddress, type Address } from "viem";
import {
  ADDR,
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

export const SLIPPAGE_BPS = 50n;

/** Converted pesos that never reached the recipient. Persisted per sender until delivered (R-039). */
export type Stranded = { account: Address; to: Address; amount: bigint; memo?: string };
const strandedKey = (a: Address) => `mercado.remesas.stranded.${a.toLowerCase()}`;
function loadStranded(a: Address | undefined): Stranded | undefined {
  if (!a) return undefined;
  try {
    const raw = localStorage.getItem(strandedKey(a));
    if (!raw) return undefined;
    const v = JSON.parse(raw) as Omit<Stranded, "amount"> & { amount: string };
    return { ...v, amount: BigInt(v.amount) };
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
  const [stranded, setStranded] = useState<Stranded>();
  useEffect(() => setStranded(loadStranded(me)), [me]);
  const [active, setActive] = useState<"send" | "recover">("send");
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
      const raw = (neededXmxn * 10n ** 8n * 102n) / (mid * 100n);
      const amountUsd = ((raw + 9_999n) / 10_000n) * 10_000n; // round up to the cent
      const estOut = (amountUsd * mid * 98n) / (10n ** 8n * 100n); // conservative expected output
      return USE_V2 ? m2.sendUsdToMxn(amountUsd, estOut, self, SLIPPAGE_BPS) : m1.swap(true, amountUsd, estOut, SLIPPAGE_BPS);
    },
    [fx.mxnPerUsd, m1, m2, stranded],
  );

  /**
   * Recovery (review): the conversion confirmed but the delivery failed, so the pesos sit in the
   * sender's own wallet. Exposes exactly what was converted (from that tx's own log) and delivers it
   * to the frozen recipient with one transfer. It never converts again.
   */
  const xmxnToken = (USE_V2 ? V2.xmxn : ADDR.xmxn) ?? ADDR.xmxn;
  // Detect: a failed send whose conversion confirmed but whose delivery didn't. Persist it.
  const convertStep =
    active === "send" && sendTx.status === "error" ? sendTx.steps.find((st) => st.receipt && /^(Mint xMXN|Swap OUSD)/.test(st.label)) : undefined;
  const delivered = sendTx.steps.some((st) => st.receipt && /^Send xMXN/.test(st.label));
  useEffect(() => {
    if (!convertStep || delivered || !attempt || !me || stranded) return;
    const amount = deliveredFromReceipt(convertStep, xmxnToken, me).amount;
    if (!amount) return;
    const v = { account: me, to: attempt.to, amount, memo: attempt.memo };
    saveStranded(me, v);
    setStranded(v);
  }, [convertStep, delivered, attempt, me, stranded, xmxnToken]);
  const deliverStranded = useCallback(async () => {
    if (!stranded) return undefined;
    setActive("recover");
    const steps = await m1.transfer(xmxnToken, stranded.to, stranded.amount, stranded.memo);
    const last = steps?.at(-1);
    if (!last) return undefined; // failed: keep it stranded (persisted) for another try
    saveStranded(stranded.account, undefined);
    setStranded(undefined);
    const r: SendReceipt = { to: stranded.to, amountIn, delivered: deliveredFromReceipt(last, xmxnToken, stranded.to).amount, memo: stranded.memo, steps: steps ?? [], at: Date.now() };
    setReceipt(r);
    return r;
  }, [stranded, m1, xmxnToken, amountIn]);

  return {
    tx,
    quote,
    send,
    convert,
    receipt,
    stranded,
    deliverStranded,
    reset: () => (setReceipt(undefined), setAttempt(undefined), setActive("send"), m1.tx.reset(), m2.tx.reset()),
  };
}
