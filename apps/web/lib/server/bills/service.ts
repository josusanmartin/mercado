// Bill payment orchestration: quote → order (CREATED) → MPP 402 charge verified on-chain (PAYMENT_VERIFIED)
// → simulated provider fulfillment (FULFILLED_SIMULATED | FAILED with paidButUnfulfilled).
// Idempotency: one order per idempotencyKey, one order per quote, one order per payment tx.
import { randomUUID } from "node:crypto";
import { formatUnits, parseUnits, type Address } from "viem";
import { SIMULATED_FULFILLMENT_LABEL, TEMPO_MODERATO_CHAIN_ID, explorerTx } from "@mercado/shared";
import type { BillPayRequest, BillPayResponse, BillQuoteRequest, BillQuoteResponse } from "@mercado/shared";
import { billPaymentToken, charge, credentialKind, merchantAddress, ownCredential } from "../../mpp/server";
import { currentBlock, findSettledAttempt, type FoundPayment } from "../../mpp/reconcile";
import { getFx } from "../fx";
import { getBillProvider } from "./providers";
import { withKeyLock } from "./lock";
import { publicOrder, readStore, transition, withStore, type StoredOrder, type StoredQuote } from "./store";

export { BillQuoteError } from "./providers";

export const QUOTE_TTL_SECONDS = 15 * 60;

export class BillError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function createQuote(req: BillQuoteRequest): Promise<BillQuoteResponse> {
  const provider = getBillProvider(req.provider);
  const pq = await provider.quote(req);
  const token = billPaymentToken();
  let amount = parseUnits(String(pq.amountMxn), 6); // 1 xMXN per MXN of face value
  let description = pq.description;
  if (token.interim) {
    // xMXN not deployed yet: charge the USD test token at the current (mock) FX rate.
    const fx = await getFx();
    amount = (amount * 100_000_000n) / BigInt(fx.mxnPerUsd);
    description += ` (charged in ${token.symbol} at ${fx.rate} MXN/USD until xMXN is live)`;
  }
  const quote: StoredQuote = {
    quoteId: `q_${randomUUID()}`,
    provider: pq.provider,
    description,
    amountMxn: pq.amountMxn,
    account: pq.account,
    amount: amount.toString(),
    token: token.address,
    tokenSymbol: token.symbol,
    recipient: merchantAddress(),
    expiresAt: Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS,
    createdAt: new Date().toISOString(),
  };
  await withStore((db) => {
    db.quotes[quote.quoteId] = quote;
  });
  return {
    quoteId: quote.quoteId,
    provider: quote.provider,
    description: quote.description,
    amountMxn: quote.amountMxn,
    amount: quote.amount,
    token: quote.token,
    tokenSymbol: quote.tokenSymbol,
    recipient: quote.recipient,
    expiresAt: quote.expiresAt,
    simulated: true,
    label: SIMULATED_FULFILLMENT_LABEL,
  };
}

/** Finds or creates the order for (quoteId, idempotencyKey). */
async function openOrder(body: BillPayRequest): Promise<StoredOrder> {
  return withStore((db) => {
    const existingId = db.idempotency[body.idempotencyKey];
    if (existingId) {
      const o = db.orders[existingId];
      if (o.quoteId !== body.quoteId)
        throw new BillError(409, "idempotencyKey was already used for a different quote", "IDEMPOTENCY_CONFLICT");
      return o;
    }
    const quote = db.quotes[body.quoteId];
    if (!quote) throw new BillError(404, "Unknown quoteId", "QUOTE_NOT_FOUND");
    const used = Object.values(db.orders).find((o) => o.quoteId === quote.quoteId);
    if (used)
      throw new BillError(409, "This quote already has an order; reuse its idempotencyKey or request a new quote", "QUOTE_USED");
    if (quote.expiresAt < Date.now() / 1000) throw new BillError(410, "Quote expired, request a new one", "QUOTE_EXPIRED");
    const now = new Date().toISOString();
    const order: StoredOrder = {
      orderId: `ord_${randomUUID()}`,
      idempotencyKey: body.idempotencyKey,
      quoteId: quote.quoteId,
      provider: quote.provider,
      description: quote.description,
      amountMxn: quote.amountMxn,
      amount: quote.amount,
      token: quote.token,
      status: "CREATED",
      paidButUnfulfilled: false,
      history: [{ status: "CREATED", at: now }],
      createdAt: now,
      updatedAt: now,
      simulated: true,
      account: quote.account,
      recipient: quote.recipient,
    };
    db.orders[order.orderId] = order;
    db.idempotency[body.idempotencyKey] = order.orderId;
    return order;
  });
}

/** Runs the provider exactly once for a PAYMENT_VERIFIED order (under the store lock). */
async function fulfill(orderId: string): Promise<StoredOrder> {
  return withStore(async (db) => {
    const order = db.orders[orderId];
    if (order.status !== "PAYMENT_VERIFIED" || order.fulfillment) return order;
    const provider = getBillProvider(order.provider);
    try {
      const f = await provider.execute(order.orderId, {
        provider: order.provider,
        description: order.description,
        amountMxn: order.amountMxn,
        account: order.account,
      });
      order.fulfillment = f;
      if (f.status === "SUCCESS") transition(order, "FULFILLED_SIMULATED", `${f.providerName} ref ${f.reference}`);
      else {
        order.paidButUnfulfilled = true;
        transition(order, "FAILED", `Paid but unfulfilled: ${f.message ?? "provider rejected"}. Needs refund/manual retry.`);
      }
    } catch (err) {
      order.paidButUnfulfilled = true;
      transition(order, "FAILED", `Paid but unfulfilled: provider error (${(err as Error).message}). Needs refund/manual retry.`);
    }
    return order;
  });
}

export type PayResult = { kind: "challenge"; response: Response } | { kind: "ok"; body: BillPayResponse; receiptHeader?: string };

function toBody(o: StoredOrder): BillPayResponse {
  return {
    orderId: o.orderId,
    status: o.status,
    paidButUnfulfilled: o.paidButUnfulfilled,
    receipt: o.receipt!,
    fulfillment: o.fulfillment,
    order: publicOrder(o),
  };
}

export async function payBill(request: Request, body: BillPayRequest): Promise<PayResult> {
  const opened = await openOrder(body);
  // The whole pay path for one order is serialized: status is re-read inside the lock, so a second
  // concurrent credential for an order that just got paid is never verified/broadcast (pull mode) or
  // recorded, and fulfillment runs at most once.
  return withKeyLock(`order:${opened.orderId}`, () => payLocked(request, opened.orderId));
}

async function payLocked(request: Request, orderId: string): Promise<PayResult> {
  let order = await readStore((db) => db.orders[orderId]);

  // Already settled/closed (retry or concurrent duplicate): never charge or fulfill again.
  if (order.status !== "CREATED") {
    // A push-mode wallet broadcasts before retrying, so a second credential here may be real money.
    // Verify it and record it as an unapplied payment for refund instead of silently dropping it.
    // (Pull-mode credentials are never broadcast for a closed order.)
    if (credentialKind(request) === "hash") order = await reconcileExtraPayment(request, order);
    if (order.status === "PAYMENT_VERIFIED") order = await fulfill(order.orderId);
    if (!order.receipt) throw new BillError(410, "Order closed without payment; request a new quote", "ORDER_CLOSED");
    return { kind: "ok", body: toBody(order), receiptHeader: order.receipt?.mppReceipt };
  }

  // Q-009: an unpaid order whose quote expired is closed rather than charged at a stale price. A request
  // that already carries a credential is still verified (its challenge carries its own expiry).
  const quote = await readStore((db) => db.quotes[order.quoteId]);
  if (!request.headers.get("Authorization") && quote && quote.expiresAt < Date.now() / 1000) {
    await withStore((db) => transition(db.orders[orderId], "FAILED", "Quote expired before payment; nothing was charged."));
    throw new BillError(410, "Quote expired before payment; request a new quote", "QUOTE_EXPIRED");
  }

  // R-009: before any new charge, resolve earlier attempts that may have settled on-chain without being
  // recorded (crash/timeout between broadcast and our write).
  const recovered = await recoverAttempts(order);
  if (recovered) return recovered;

  const cred = ownCredential(request);
  if (cred?.externalId && cred.externalId !== order.orderId)
    throw new BillError(409, "Payment credential is bound to a different order", "CREDENTIAL_ORDER_MISMATCH");
  if (holdActive(order, cred?.challengeId) && cred?.kind !== "hash") throw settlementPending();

  if (cred) {
    // Persist the attempt BEFORE mppx may broadcast it, so a crash can be reconciled on the next request.
    const fromBlock = (await currentBlock().catch(() => 0n)) - 5n;
    order = await withStore((db) => {
      const o = db.orders[orderId];
      (o.pendingAttempts ??= []).push({
        challengeId: cred.challengeId,
        kind: cred.kind,
        txHash: cred.txHash,
        fromBlock: (fromBlock > 0n ? fromBlock : 0n).toString(),
        at: new Date().toISOString(),
        holdUntil: Date.now() + PENDING_HOLD_MS,
      });
      return o;
    });
  }

  const outcome = await charge(request, {
    amount: formatUnits(BigInt(order.amount), 6),
    currency: order.token as Address,
    recipient: order.recipient,
    externalId: order.orderId,
    description: order.description,
    meta: { orderId: order.orderId, quoteId: order.quoteId },
  });

  if (!outcome.paid) {
    if (cred) {
      // The credential failed. It may still have settled (e.g. confirmation timed out after broadcast):
      // check the chain, and don't hand out a fresh challenge while that's unresolved.
      const late = await recoverAttempts(order);
      if (late) return late;
      throw settlementPending(await outcome.challenge.clone().text().catch(() => ""));
    }
    const headers = new Headers(outcome.challenge.headers);
    headers.set("X-Mercado-Order-Id", order.orderId);
    const response = new Response(outcome.challenge.body, { status: 402, headers });
    return { kind: "challenge", response };
  }

  // Defense in depth: mppx already pins externalId/meta, but double-check the binding.
  if (outcome.externalId && outcome.externalId !== order.orderId)
    throw new BillError(409, "Payment credential is bound to a different order", "CREDENTIAL_ORDER_MISMATCH");

  const payer = outcome.payer ?? (await payerFromTx(outcome.txHash));
  order = await recordPayment(orderId, { txHash: outcome.txHash, payer, receiptHeader: outcome.receiptHeader }, "MPP payment verified on-chain");
  order = await fulfill(order.orderId);
  return { kind: "ok", body: toBody(order), receiptHeader: outcome.receiptHeader };
}

/** How long a failed/interrupted attempt blocks new charges. Pull-mode txs expire ≤25s after signing. */
const PENDING_HOLD_MS = 60_000;

function holdActive(order: StoredOrder, exceptChallengeId?: string) {
  return (order.pendingAttempts ?? []).some((a) => a.holdUntil > Date.now() && a.challengeId !== exceptChallengeId);
}

function settlementPending(detail?: string) {
  return new BillError(
    409,
    `A payment attempt for this order is still settling or failed moments ago; retry in a minute (same idempotencyKey). Nothing new was charged.${detail ? ` Last error: ${detail.slice(0, 300)}` : ""}`,
    "SETTLEMENT_PENDING",
  );
}

/** Applies an on-chain settlement found for one of the order's recorded attempts. */
async function recoverAttempts(order: StoredOrder): Promise<PayResult | null> {
  if (!order.pendingAttempts?.length) return null;
  let found: FoundPayment | null;
  try {
    found = await findSettledAttempt({
      token: order.token as Address,
      recipient: order.recipient,
      amount: BigInt(order.amount),
      attempts: order.pendingAttempts,
    });
  } catch (err) {
    console.warn("[bills] reconciliation scan failed:", (err as Error).message.split("\n")[0]);
    if (holdActive(order)) throw settlementPending();
    return null;
  }
  if (!found) return null;
  let o = await recordPayment(order.orderId, { txHash: found.txHash, payer: found.payer }, "Recovered: payment found on-chain for an interrupted attempt");
  o = await fulfill(o.orderId);
  return { kind: "ok", body: toBody(o), receiptHeader: undefined };
}

async function recordPayment(
  orderId: string,
  p: { txHash: `0x${string}`; payer?: Address; receiptHeader?: string },
  note: string,
): Promise<StoredOrder> {
  return withStore((db) => {
    const o = db.orders[orderId];
    const tx = p.txHash.toLowerCase();
    const boundTo = db.payments[tx];
    if (boundTo && boundTo !== o.orderId)
      throw new BillError(409, "This payment was already used for another order", "PAYMENT_REUSED");
    if (o.status !== "CREATED") return o; // already applied (e.g. recovered concurrently)
    db.payments[tx] = o.orderId;
    o.receipt = {
      txHash: p.txHash,
      amount: o.amount,
      token: o.token,
      payer: p.payer,
      recipient: o.recipient,
      chainId: TEMPO_MODERATO_CHAIN_ID,
      mppReceipt: p.receiptHeader,
      verifiedAt: new Date().toISOString(),
      explorerUrl: explorerTx(p.txHash),
    };
    o.pendingAttempts = [];
    transition(o, "PAYMENT_VERIFIED", `${note}: ${p.txHash}`);
    return o;
  });
}

async function reconcileExtraPayment(request: Request, order: StoredOrder): Promise<StoredOrder> {
  const outcome = await charge(request, {
    amount: formatUnits(BigInt(order.amount), 6),
    currency: order.token as Address,
    recipient: order.recipient,
    externalId: order.orderId,
    description: order.description,
    meta: { orderId: order.orderId, quoteId: order.quoteId },
  });
  if (!outcome.paid) return order;
  const payer = outcome.payer ?? (await payerFromTx(outcome.txHash));
  return withStore((db) => {
    const o = db.orders[order.orderId];
    const tx = outcome.txHash.toLowerCase();
    if (db.payments[tx]) return o;
    db.payments[tx] = o.orderId;
    const reason = o.receipt ? "duplicate payment for an already-paid order" : "payment arrived after the order was closed";
    (o.unappliedPayments ??= []).push({ txHash: outcome.txHash, amount: o.amount, payer, detectedAt: new Date().toISOString(), reason });
    o.history.push({ status: o.status, at: new Date().toISOString(), note: `Unapplied payment ${outcome.txHash}: ${reason}. Needs manual refund.` });
    o.updatedAt = new Date().toISOString();
    return o;
  });
}

async function payerFromTx(hash: `0x${string}`): Promise<Address | undefined> {
  try {
    const { publicClient } = await import("../chain");
    return (await publicClient().getTransactionReceipt({ hash })).from;
  } catch {
    return undefined;
  }
}

export async function getOrder(orderId: string) {
  return readStore((db) => {
    const o = db.orders[orderId] ?? db.orders[db.idempotency[orderId] ?? ""];
    return o ? publicOrder(o) : undefined;
  });
}
