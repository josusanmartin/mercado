// Order state machine, idempotency and concurrency with the mppx charge stubbed out (no testnet transfers).
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Stub: "Authorization: Payment <txHash>[:<externalId>]" counts as a verified payment of that tx. */
const settled: string[] = [];
const chargeStub = vi.fn(async (request: Request, opts: { externalId: string }) => {
  const auth = request.headers.get("Authorization");
  if (!auth) return { paid: false as const, challenge: new Response("{}", { status: 402, headers: { "WWW-Authenticate": "Payment stub" } }) };
  await new Promise((r) => setTimeout(r, 40)); // on-chain verification latency
  const [txHash, externalId] = auth.replace("Payment ", "").split(":");
  settled.push(txHash);
  return {
    paid: true as const,
    txHash: txHash as `0x${string}`,
    receiptHeader: `receipt-${txHash}`,
    receipt: { method: "tempo", reference: txHash, status: "success" as const, timestamp: new Date().toISOString() },
    payer: "0x3333333333333333333333333333333333333333" as const,
    externalId: externalId ?? opts.externalId,
  };
});
vi.mock("../../mpp/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mpp/server")>()),
  charge: (...args: Parameters<typeof chargeStub>) => chargeStub(...args),
}));

import { getBillProvider } from "../bills/providers";
import { order, pay, quote } from "./helpers";

const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
let n = 0;
const key = () => `idem-flow-${++n}-${Date.now()}`;
const newQuote = async (phone = "5512345678") =>
  (await quote({ provider: "telcel", phone, amountMxn: 100 })).body.quoteId as string;

beforeEach(() => {
  chargeStub.mockClear();
  settled.length = 0;
  vi.restoreAllMocks();
});

describe("bill order state machine", () => {
  it("402 when unpaid, then PAYMENT_VERIFIED → FULFILLED_SIMULATED with receipt", async () => {
    const quoteId = await newQuote();
    const k = key();
    expect((await pay({ quoteId, idempotencyKey: k })).status).toBe(402);
    const res = await pay({ quoteId, idempotencyKey: k }, `Payment ${tx(1)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Payment-Receipt")).toBe(`receipt-${tx(1)}`);
    const body = await res.json();
    expect(body.status).toBe("FULFILLED_SIMULATED");
    expect(body.receipt.txHash).toBe(tx(1));
    expect(body.fulfillment.simulated).toBe(true);
    expect(body.fulfillment.label).toBe("SIMULATED fulfillment, no real top-up");
    expect(body.fulfillment.reference).toMatch(/^TLC-\d{8}-\d{8}$/);
    expect(body.order.history.map((h: { status: string }) => h.status)).toEqual(["CREATED", "PAYMENT_VERIFIED", "FULFILLED_SIMULATED"]);
  });

  it("retrying with the same idempotency key returns the same order and never charges or fulfills twice", async () => {
    const execute = vi.spyOn(getBillProvider("telcel"), "execute");
    const quoteId = await newQuote();
    const k = key();
    const first = await (await pay({ quoteId, idempotencyKey: k }, `Payment ${tx(2)}`)).json();
    const again = await pay({ quoteId, idempotencyKey: k }); // no credential needed: already paid
    expect(again.status).toBe(200);
    const second = await again.json();
    const third = await (await pay({ quoteId, idempotencyKey: k }, `Payment ${tx(3)}`)).json(); // a new payment is ignored
    expect(second.orderId).toBe(first.orderId);
    expect(third.orderId).toBe(first.orderId);
    expect(third.receipt.txHash).toBe(tx(2));
    expect(second.fulfillment.reference).toBe(first.fulfillment.reference);
    expect(chargeStub).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("R-005: two concurrent credentials for one order settle once and fulfill once", async () => {
    const execute = vi.spyOn(getBillProvider("telcel"), "execute");
    const quoteId = await newQuote();
    const k = key();
    const [a, b] = await Promise.all([
      pay({ quoteId, idempotencyKey: k }, `Payment ${tx(10)}`),
      pay({ quoteId, idempotencyKey: k }, `Payment ${tx(11)}`),
    ]);
    const [ja, jb] = [await a.json(), await b.json()];
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(ja.orderId).toBe(jb.orderId);
    expect(settled).toEqual([tx(10)]); // the second credential was never verified/broadcast
    expect(jb.receipt.txHash).toBe(tx(10));
    expect(execute).toHaveBeenCalledTimes(1);
    const o = (await order(ja.orderId)).body;
    expect(o.history.filter((h: { status: string }) => h.status === "PAYMENT_VERIFIED")).toHaveLength(1);
  });

  it("a quote backs at most one order", async () => {
    const quoteId = await newQuote();
    await pay({ quoteId, idempotencyKey: key() });
    const res = await pay({ quoteId, idempotencyKey: key() });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("QUOTE_USED");
  });

  it("an idempotency key can't be reused for a different quote", async () => {
    const k = key();
    await pay({ quoteId: await newQuote(), idempotencyKey: k });
    const res = await pay({ quoteId: await newQuote(), idempotencyKey: k });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("a payment tx can settle only one order", async () => {
    await pay({ quoteId: await newQuote(), idempotencyKey: key() }, `Payment ${tx(20)}`);
    const res = await pay({ quoteId: await newQuote(), idempotencyKey: key() }, `Payment ${tx(20)}`);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("PAYMENT_REUSED");
  });

  it("rejects a credential bound to another order", async () => {
    const res = await pay({ quoteId: await newQuote(), idempotencyKey: key() }, `Payment ${tx(30)}:ord_someone-else`);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CREDENTIAL_ORDER_MISMATCH");
  });

  it("provider failure after payment → FAILED with paidButUnfulfilled, and retries don't re-run the provider", async () => {
    const execute = vi.spyOn(getBillProvider("telcel"), "execute");
    const quoteId = await newQuote("5500000000");
    const k = key();
    const body = await (await pay({ quoteId, idempotencyKey: k }, `Payment ${tx(40)}`)).json();
    expect(body.status).toBe("FAILED");
    expect(body.paidButUnfulfilled).toBe(true);
    expect(body.receipt.txHash).toBe(tx(40));
    const retry = await (await pay({ quoteId, idempotencyKey: k })).json();
    expect(retry.status).toBe("FAILED");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("expired quotes can't open orders", async () => {
    const { withStore } = await import("../bills/store");
    const quoteId = await newQuote();
    await withStore((db) => {
      db.quotes[quoteId].expiresAt = 1;
    });
    const res = await pay({ quoteId, idempotencyKey: key() });
    expect(res.status).toBe(410);
  });

  it("validates quote input", async () => {
    expect((await quote({ provider: "telcel", phone: "5512345678", amountMxn: 77 })).res.status).toBe(400);
    expect((await quote({ provider: "telcel", amountMxn: 100 })).res.status).toBe(400);
    const cfe = await quote({ provider: "cfe", serviceNumber: "123456789012", amountMxn: 432.5 });
    expect(cfe.res.status).toBe(200);
    expect(cfe.body.amountMxn).toBe(432.5);
  });
});
