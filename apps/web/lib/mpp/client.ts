// Client helper for paying bills over MPP (HTTP 402). Works in the browser (wagmi wallet client →
// mppx "push" mode: the wallet broadcasts the transfer) and in Node scripts (local viem account →
// "pull" mode: mppx signs, the server broadcasts). Isomorphic: no server-only imports.
import { Mppx, tempo } from "mppx/client";
import { Receipt } from "mppx";
import { createClient, http, type Account, type Client } from "viem";
import { TEMPO_MODERATO_CHAIN_ID, tempoModerato } from "@mercado/shared";
import type { BillOrder, BillPayResponse, BillQuoteRequest, BillQuoteResponse } from "@mercado/shared";

export type PayStage = "requesting" | "challenge" | "signing" | "verifying" | "done";

export interface PayBillParams {
  quoteId: string;
  /** Reuse the same key when retrying: the server returns the same order and never charges twice. */
  idempotencyKey?: string;
  /** "" in the browser (same origin); e.g. "http://localhost:3100" from scripts. */
  baseUrl?: string;
  /** A wallet client with an account (wagmi `useWalletClient().data`). Preferred in the browser. */
  walletClient?: Client;
  /** A local viem account (privateKeyToAccount) for scripts/tests. */
  account?: Account;
  onStage?: (stage: PayStage) => void;
  /** Force "push" (client broadcasts) or "pull" (server broadcasts). Default: push for wallet clients,
   *  pull for local accounts. */
  mode?: "push" | "pull";
}

export interface PayBillResult {
  order: BillPayResponse;
  /** Parsed Payment-Receipt header (reference = settlement tx hash), null if absent. */
  receipt: ReturnType<typeof Receipt.deserialize> | null;
  idempotencyKey: string;
}

export class BillPaymentError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** POST /api/bills/quote */
export async function quoteBill(req: BillQuoteRequest, baseUrl = ""): Promise<BillQuoteResponse> {
  const res = await fetch(`${baseUrl}/api/bills/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = await res.json();
  if (!res.ok) throw new BillPaymentError(body.error ?? "Quote failed", res.status, body.code);
  return body;
}

// In-flight payments by quote: a double click must never start a second transfer. This matters most for
// push-mode wallets (Tempo Wallet, passkeys, injected), which broadcast before the server sees anything.
const inFlight = new Map<string, Promise<PayBillResult>>();

/**
 * POST /api/bills/pay with the full 402 → pay → retry dance. Concurrent calls for the same quote share
 * one payment. On a network error after paying, call again with the SAME idempotencyKey: the server
 * returns the already-paid order without charging again.
 */
export function payBill(params: PayBillParams): Promise<PayBillResult> {
  const existing = inFlight.get(params.quoteId);
  if (existing) return existing;
  const p = payBillOnce(params).finally(() => inFlight.delete(params.quoteId));
  inFlight.set(params.quoteId, p);
  return p;
}

async function payBillOnce(params: PayBillParams): Promise<PayBillResult> {
  const { quoteId, baseUrl = "", walletClient, account, onStage, mode } = params;
  if (!walletClient && !account) throw new Error("payBill needs a walletClient or an account");
  const idempotencyKey = params.idempotencyKey ?? crypto.randomUUID();

  const mppx = Mppx.create({
    polyfill: false,
    methods: [
      tempo.charge({
        expectedChainId: TEMPO_MODERATO_CHAIN_ID,
        ...(mode ? { mode } : {}),
        // Local accounts get a client on the shared chain, whose default fee token is a USD TIP-20:
        // xMXN can't pay Tempo fees (FeeTokenNotUsdError).
        ...(account ? { account, getClient: () => createClient({ chain: tempoModerato, transport: http(), account }) } : {}),
        ...(walletClient ? { getClient: () => walletClient, account: walletClient.account } : {}),
      }),
    ],
  });
  mppx.onChallengeReceived(() => {
    onStage?.("challenge");
    return undefined;
  });
  mppx.onCredentialCreated(() => {
    onStage?.("verifying");
  });

  onStage?.("requesting");
  const res = await mppx.fetch(`${baseUrl}/api/bills/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId, idempotencyKey }),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text };
  }
  if (!res.ok) {
    const b = body as { error?: string; detail?: string; title?: string; code?: string };
    throw new BillPaymentError(b.error ?? b.detail ?? b.title ?? `Payment failed (${res.status})`, res.status, b.code);
  }
  let receipt: PayBillResult["receipt"] = null;
  try {
    receipt = Receipt.fromResponse(res);
  } catch {
    /* idempotent replays may omit the header */
  }
  onStage?.("done");
  return { order: body as BillPayResponse, receipt, idempotencyKey };
}

/** GET /api/bills/orders/:id (orderId or idempotencyKey). */
export async function getBillOrder(id: string, baseUrl = ""): Promise<BillOrder> {
  const res = await fetch(`${baseUrl}/api/bills/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new BillPaymentError(body.error ?? "Order lookup failed", res.status, body.code);
  return body;
}
