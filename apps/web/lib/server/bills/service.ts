// Bill payment orchestration: quote → order (CREATED) → MPP 402 charge verified on-chain (PAYMENT_VERIFIED)
// → simulated provider fulfillment (FULFILLED_SIMULATED | FAILED with paidButUnfulfilled).
// Idempotency: one order per idempotencyKey, one order per quote, one order per payment tx.
import { randomUUID } from "node:crypto";
import { formatUnits, parseUnits, type Address } from "viem";
import { SIMULATED_FULFILLMENT_LABEL, TEMPO_MODERATO_CHAIN_ID, explorerTx } from "@mercado/shared";
import type { BillPayRequest, BillPayResponse, BillQuoteRequest, BillQuoteResponse } from "@mercado/shared";
import { billPaymentToken, charge, merchantAddress } from "../../mpp/server";
import { getFx } from "../fx";
import { getBillProvider } from "./providers";
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
  let order = await openOrder(body);

  // Already paid (retry with the same idempotency key): never charge or fulfill again.
  if (order.status !== "CREATED") {
    if (order.status === "PAYMENT_VERIFIED") order = await fulfill(order.orderId);
    return { kind: "ok", body: toBody(order), receiptHeader: order.receipt?.mppReceipt };
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
    const headers = new Headers(outcome.challenge.headers);
    headers.set("X-Mercado-Order-Id", order.orderId);
    const response = new Response(outcome.challenge.body, { status: 402, headers });
    return { kind: "challenge", response };
  }

  // Defense in depth: mppx already pins externalId/meta, but double-check the binding.
  if (outcome.externalId && outcome.externalId !== order.orderId)
    throw new BillError(409, "Payment credential is bound to a different order", "CREDENTIAL_ORDER_MISMATCH");

  const payer = outcome.payer ?? (await payerFromTx(outcome.txHash));
  order = await withStore((db) => {
    const o = db.orders[order.orderId];
    const tx = outcome.txHash.toLowerCase();
    const boundTo = db.payments[tx];
    if (boundTo && boundTo !== o.orderId)
      throw new BillError(409, "This payment was already used for another order", "PAYMENT_REUSED");
    if (o.status === "CREATED") {
      db.payments[tx] = o.orderId;
      o.receipt = {
        txHash: outcome.txHash,
        amount: o.amount,
        token: o.token,
        payer,
        recipient: o.recipient,
        chainId: TEMPO_MODERATO_CHAIN_ID,
        mppReceipt: outcome.receiptHeader,
        verifiedAt: new Date().toISOString(),
        explorerUrl: explorerTx(outcome.txHash),
      };
      transition(o, "PAYMENT_VERIFIED", `MPP payment verified on-chain: ${outcome.txHash}`);
    }
    return o;
  });
  order = await fulfill(order.orderId);
  return { kind: "ok", body: toBody(order), receiptHeader: outcome.receiptHeader };
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
