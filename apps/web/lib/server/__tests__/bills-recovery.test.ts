// R-009 interrupted-settlement recovery, Q-009 stale orders, push-mode duplicate payments.
// mppx charge, credential parsing and the on-chain log scan are stubbed (no testnet transfers).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../fx", () => ({
  getFx: async () => ({ mxnPerUsd: "2000000000", rate: 20, updatedAt: 0, source: "config-fallback", isMock: true, stale: true, label: "test" }),
}));

type Outcome = { paid: false } | { paid: true; txHash: string } | { throws: string };
let nextOutcome: Outcome = { paid: false };
const chargeStub = vi.fn(async () => {
  const o = nextOutcome;
  if ("throws" in o) throw new Error(o.throws);
  if (!o.paid) return { paid: false as const, challenge: new Response('{"detail":"stub failure"}', { status: 402, headers: { "WWW-Authenticate": "Payment stub" } }) };
  return {
    paid: true as const,
    txHash: o.txHash as `0x${string}`,
    receiptHeader: `receipt-${o.txHash}`,
    receipt: { method: "tempo", reference: o.txHash, status: "success" as const, timestamp: "" },
    payer: "0x3333333333333333333333333333333333333333" as const,
  };
});
/** "Payment cred:<kind>:<challengeId>[:<txHash>]" */
let ownCredentialOverride: Record<string, string> | null = null;
const ownCredentialStub = (request: Request) => {
  if (ownCredentialOverride) return ownCredentialOverride;
  const h = request.headers.get("Authorization");
  if (!h?.startsWith("Payment cred:")) return null;
  const [, kind, challengeId, txHash] = h.replace("Payment ", "").split(":");
  return { kind, challengeId, txHash };
};
vi.mock("../../mpp/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mpp/server")>()),
  charge: () => chargeStub(),
  ownCredential: (r: Request) => ownCredentialStub(r),
  credentialKind: (r: Request) => ownCredentialStub(r)?.kind ?? null,
}));

const findSettled = vi.fn(async (): Promise<unknown> => null);
vi.mock("../../mpp/reconcile", () => ({
  findSettledAttempt: () => findSettled(),
  currentBlock: async () => 1000n,
}));

import { getBillProvider } from "../bills/providers";
import { withStore } from "../bills/store";
import { order, pay, quote } from "./helpers";

const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
let n = 0;
const key = () => `idem-rec-${++n}-${Date.now()}`;
const newQuote = async () => (await quote({ provider: "telcel", phone: "5512345678", amountMxn: 100 })).body.quoteId as string;

beforeEach(() => {
  chargeStub.mockClear();
  findSettled.mockReset();
  findSettled.mockResolvedValue(null);
  nextOutcome = { paid: false };
  vi.restoreAllMocks();
});

describe("R-009 interrupted settlement recovery", () => {
  it("a crash after broadcast is recovered from chain on retry, without a new charge", async () => {
    const quoteId = await newQuote();
    const k = key();
    nextOutcome = { throws: "socket hang up after broadcast" };
    const crashed = await pay({ quoteId, idempotencyKey: k }, "Payment cred:transaction:chal-A");
    expect(crashed.status).toBe(500);
    const pending = (await order(k)).body;
    expect(pending.status).toBe("CREATED");
    expect(pending.pendingAttempts).toBeUndefined(); // internal, not exposed

    findSettled.mockResolvedValue({ txHash: tx(1), payer: "0x4444444444444444444444444444444444444444", challengeId: "chal-A" });
    chargeStub.mockClear();
    const retry = await pay({ quoteId, idempotencyKey: k });
    expect(retry.status).toBe(200);
    const body = await retry.json();
    expect(body.status).toBe("FULFILLED_SIMULATED");
    expect(body.receipt.txHash).toBe(tx(1));
    expect(body.receipt.payer).toBe("0x4444444444444444444444444444444444444444");
    expect(body.order.history.some((h: { note?: string }) => h.note?.startsWith("Recovered"))).toBe(true);
    expect(chargeStub).not.toHaveBeenCalled();
  });

  it("a failed credential that isn't on chain yields SETTLEMENT_PENDING, not a fresh 402, until the hold lapses", async () => {
    const quoteId = await newQuote();
    const k = key();
    const failed = await pay({ quoteId, idempotencyKey: k }, "Payment cred:transaction:chal-B");
    expect(failed.status).toBe(409);
    expect((await failed.json()).code).toBe("SETTLEMENT_PENDING");
    const again = await pay({ quoteId, idempotencyKey: k });
    expect(again.status).toBe(409);
    // a different pull credential during the hold is refused before mppx could broadcast it
    chargeStub.mockClear();
    const other = await pay({ quoteId, idempotencyKey: k }, "Payment cred:transaction:chal-C");
    expect(other.status).toBe(409);
    expect(chargeStub).not.toHaveBeenCalled();

    const orderId = (await order(k)).body.orderId;
    await withStore((db) => {
      for (const a of db.orders[orderId].pendingAttempts ?? []) a.holdUntil = 0;
    });
    const fresh = await pay({ quoteId, idempotencyKey: k });
    expect(fresh.status).toBe(402);
    // still scanned (non-blocking) until its challenge expires, then dropped after a clean scan
    expect(await withStore((db) => db.orders[orderId].pendingAttempts?.length)).toBe(1);
    await withStore((db) => {
      for (const a of db.orders[orderId].pendingAttempts ?? []) a.keepUntil = 0;
    });
    expect((await pay({ quoteId, idempotencyKey: k })).status).toBe(402);
    expect(await withStore((db) => db.orders[orderId].pendingAttempts)).toEqual([]);
  });

  it("an attempt that settles after verification failed is still applied", async () => {
    const quoteId = await newQuote();
    const k = key();
    findSettled.mockResolvedValueOnce({ txHash: tx(2), payer: "0x4444444444444444444444444444444444444444", challengeId: "chal-D" });
    const res = await pay({ quoteId, idempotencyKey: k }, "Payment cred:transaction:chal-D");
    expect(res.status).toBe(200);
    expect((await res.json()).receipt.txHash).toBe(tx(2));
  });

  it("rejects a credential bound to another order before recording an attempt", async () => {
    const quoteId = await newQuote();
    const k = key();
    await pay({ quoteId, idempotencyKey: k });
    // simulate an HMAC-valid credential whose externalId is another order
    ownCredentialOverride = { kind: "transaction", challengeId: "chal-X", externalId: "ord_other" };
    const res = await pay({ quoteId, idempotencyKey: k }, "Payment cred:transaction:chal-X");
    ownCredentialOverride = null;
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CREDENTIAL_ORDER_MISMATCH");
    const orderId = (await order(k)).body.orderId;
    const { readStore } = await import("../bills/store");
    expect(await readStore((db) => db.orders[orderId].pendingAttempts ?? [])).toEqual([]);
  });
  it("stays blocked while the chain can't be checked, even after the hold lapses", async () => {
    const quoteId = await newQuote();
    const k = key();
    expect((await pay({ quoteId, idempotencyKey: k }, "Payment cred:transaction:chal-G")).status).toBe(409);
    const orderId = (await order(k)).body.orderId;
    await withStore((db) => {
      for (const a of db.orders[orderId].pendingAttempts ?? []) a.holdUntil = 0;
    });
    findSettled.mockRejectedValue(new Error("RPC down"));
    chargeStub.mockClear();
    const blocked = await pay({ quoteId, idempotencyKey: k });
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).code).toBe("SETTLEMENT_PENDING");
    expect(chargeStub).not.toHaveBeenCalled();
    findSettled.mockResolvedValue(null);
    expect((await pay({ quoteId, idempotencyKey: k })).status).toBe(402);
  });
});

describe("push-mode duplicate payments", () => {
  it("a second, already-broadcast payment for a paid order is recorded as unapplied, never fulfilled", async () => {
    const execute = vi.spyOn(getBillProvider("telcel"), "execute");
    const quoteId = await newQuote();
    const k = key();
    nextOutcome = { paid: true, txHash: tx(10) };
    const first = await (await pay({ quoteId, idempotencyKey: k }, `Payment cred:hash:chal-E:${tx(10)}`)).json();
    expect(first.status).toBe("FULFILLED_SIMULATED");

    nextOutcome = { paid: true, txHash: tx(11) };
    const dup = await (await pay({ quoteId, idempotencyKey: k }, `Payment cred:hash:chal-F:${tx(11)}`)).json();
    expect(dup.status).toBe("FULFILLED_SIMULATED");
    expect(dup.receipt.txHash).toBe(tx(10));
    expect(dup.order.unappliedPayments).toHaveLength(1);
    expect(dup.order.unappliedPayments[0].txHash).toBe(tx(11));
    expect(dup.order.unappliedPayments[0].reason).toMatch(/duplicate/);
    expect(execute).toHaveBeenCalledTimes(1);

    // presenting the same duplicate again doesn't double-record it
    const again = await (await pay({ quoteId, idempotencyKey: k }, `Payment cred:hash:chal-F:${tx(11)}`)).json();
    expect(again.order.unappliedPayments).toHaveLength(1);
  });
});

describe("Q-009 stale CREATED orders", () => {
  it("recovers a settled attempt instead of closing the order when the quote expired meanwhile", async () => {
    const quoteId = await newQuote();
    const k = key();
    nextOutcome = { throws: "timeout after broadcast" };
    await pay({ quoteId, idempotencyKey: k }, "Payment cred:transaction:chal-H");
    await withStore((db) => {
      db.quotes[quoteId].expiresAt = 1;
    });
    findSettled.mockResolvedValue({ txHash: tx(50), payer: "0x4444444444444444444444444444444444444444", challengeId: "chal-H" });
    const res = await pay({ quoteId, idempotencyKey: k });
    expect(res.status).toBe(200);
    expect((await res.json()).receipt.txHash).toBe(tx(50));
  });

  it("doesn't close an expired order while an attempt is unresolved", async () => {
    const quoteId = await newQuote();
    const k = key();
    await pay({ quoteId, idempotencyKey: k }, "Payment cred:transaction:chal-I"); // 409 pending
    await withStore((db) => {
      db.quotes[quoteId].expiresAt = 1;
    });
    const res = await pay({ quoteId, idempotencyKey: k });
    expect(res.status).toBe(409);
    expect((await order(k)).body.status).toBe("CREATED");
  });

  it("an unpaid order whose quote expired is closed, not charged at a stale price", async () => {
    const quoteId = await newQuote();
    const k = key();
    expect((await pay({ quoteId, idempotencyKey: k })).status).toBe(402);
    await withStore((db) => {
      db.quotes[quoteId].expiresAt = 1;
    });
    const res = await pay({ quoteId, idempotencyKey: k });
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("QUOTE_EXPIRED");
    const o = (await order(k)).body;
    expect(o.status).toBe("FAILED");
    expect(o.paidButUnfulfilled).toBe(false);
    const after = await pay({ quoteId, idempotencyKey: k });
    expect(after.status).toBe(410);
    expect((await after.json()).code).toBe("ORDER_CLOSED");
  });
});
