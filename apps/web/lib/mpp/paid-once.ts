// Pay-once for one-shot MPP products (signed partner quote, underwriting report): the paid intent is persisted
// the moment payment is verified, BEFORE any post-payment work (chain reads, scoring, signing). If that work
// fails, the caller gets an error that carries the Payment-Receipt, and a retry with the SAME credential
// recovers it: it is recognised from the store (keyed by the HMAC-verified challenge id) and produces the
// result again without a new charge. Stored in <repo>/.data/paid-results.json (gitignored).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Address, Hex } from "viem";
import { repoRoot } from "../server/env";
import { withKeyLock } from "../server/bills/lock";
import { jsonError } from "../server/http";
import { charge, ownCredential, type ChargeOptions } from "./server";
import { recordPaidCall, type PaidProduct } from "./ledger";

export interface PaidRecord {
  challengeId: string;
  product: PaidProduct;
  /** The challenge's externalId (binds product + parameters); a retry must ask for the same thing. */
  externalId: string;
  txHash: Hex;
  payer?: Address;
  receiptHeader: string;
  paidAt: string;
  /** Set once the paid work succeeded (served again as-is on a retry). */
  fulfilledAt?: string;
}

const file = () => process.env.MERCADO_PAID_RESULTS_FILE ?? path.join(repoRoot(), ".data", "paid-results.json");
const load = (): Record<string, PaidRecord> => (existsSync(file()) ? JSON.parse(readFileSync(file(), "utf8")) : {});
function save(all: Record<string, PaidRecord>) {
  mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, file());
}
const put = (r: PaidRecord) =>
  withKeyLock("mpp-paid-results", async () => {
    const all = load();
    all[r.challengeId] = { ...all[r.challengeId], ...r };
    save(all);
  });

export interface PaidOnceOptions<T> {
  product: PaidProduct;
  charge: ChargeOptions & { externalId: string };
  /** Base units (6 dp) of the fee, for the ledger. */
  feeUnits: string;
  token: Address;
  protocol: "v1" | "v2";
  /** Ledger summary before the result exists (written at payment time). */
  summary: string;
  /** The paid work. Runs after the paid intent is persisted; may run again on a recovery retry. */
  produce: () => Promise<T>;
  /** Builds the 200 response from the result (the original Payment-Receipt is passed back on recovery too). */
  respond: (result: T, payment: { txHash: Hex; payer?: Address; receiptHeader: string }) => Response | Promise<Response>;
}

/**
 * 402 → pay → persist → produce. A credential whose challenge already paid is recovered from the store
 * (no second charge). Errors from `produce` after payment return 502 PAID_RESULT_PENDING with the
 * Payment-Receipt so the client can retry with the same credential.
 */
export async function paidOnce<T>(request: Request, o: PaidOnceOptions<T>): Promise<Response> {
  const cred = ownCredential(request);
  let paid = cred ? load()[cred.challengeId] : undefined;

  if (paid && paid.externalId !== o.charge.externalId)
    return jsonError(409, "This payment was for a different request; retry with the original parameters.", "PAYMENT_REQUEST_MISMATCH");

  if (!paid) {
    const outcome = await charge(request, o.charge);
    if (!outcome.paid) return outcome.challenge;
    paid = {
      // a paid credential is always our own (verified by mppx); the tx hash is a fallback key
      challengeId: ownCredential(request)?.challengeId ?? outcome.txHash,
      product: o.product,
      externalId: o.charge.externalId,
      txHash: outcome.txHash,
      payer: outcome.payer,
      receiptHeader: outcome.receiptHeader,
      paidAt: new Date().toISOString(),
    };
    // persist the paid intent and the ledger row BEFORE any post-payment read
    await put(paid);
    await recordPaidCall({
      product: o.product,
      txHash: paid.txHash,
      payer: paid.payer,
      amount: o.feeUnits,
      token: o.token,
      protocol: o.protocol,
      summary: o.summary,
      at: paid.paidAt,
    });
  }

  const payment = { txHash: paid.txHash, payer: paid.payer, receiptHeader: paid.receiptHeader };
  let result: T;
  try {
    result = await o.produce();
  } catch (e) {
    console.error(`[mpp/paid-once] ${o.product} failed after payment ${paid.txHash}`, e);
    const res = jsonError(
      502,
      "Your payment was received, but the result couldn't be produced right now. Retry with the same payment credential: you won't be charged again.",
      "PAID_RESULT_PENDING",
    );
    res.headers.set("Payment-Receipt", paid.receiptHeader);
    return res;
  }
  if (!paid.fulfilledAt) await put({ ...paid, fulfilledAt: new Date().toISOString() });
  return o.respond(result, payment);
}
