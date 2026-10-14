// Uses the REAL mppx server: an unpaid request must get an HTTP 402 Payment challenge bound to the order.
import { describe, expect, it, vi } from "vitest";

const findSettled = vi.fn(async (_p: { attempts: { challengeId: string; kind: string }[] }): Promise<unknown> => null);
vi.mock("../../mpp/reconcile", () => ({
  findSettledAttempt: (p: { attempts: { challengeId: string; kind: string }[] }) => findSettled(p),
  currentBlock: async () => 1000n,
}));

import { Challenge } from "mppx";
import { order, pay, quote } from "./helpers";

describe("POST /api/bills/pay (real mppx)", () => {
  it("returns a real 402 challenge bound to amount, token, recipient and order", async () => {
    const q = await quote({ provider: "telcel", phone: "5512345678", amountMxn: 100 });
    expect(q.res.status).toBe(200);
    expect(q.body.simulated).toBe(true);
    expect(q.body.label).toMatch(/SIMULATED/);

    const res = await pay({ quoteId: q.body.quoteId, idempotencyKey: "idem-402-test-0001" });
    expect(res.status).toBe(402);
    const www = res.headers.get("WWW-Authenticate");
    expect(www).toMatch(/^Payment /);
    const orderId = res.headers.get("X-Mercado-Order-Id")!;
    expect(orderId).toMatch(/^ord_/);

    const challenge = Challenge.deserialize(www!);
    expect(challenge.method).toBe("tempo");
    expect(challenge.intent).toBe("charge");
    const req = challenge.request as Record<string, any>;
    expect(req.amount).toBe(q.body.amount);
    expect(req.currency.toLowerCase()).toBe(q.body.token.toLowerCase());
    expect(req.recipient.toLowerCase()).toBe(q.body.recipient.toLowerCase());
    expect(req.externalId).toBe(orderId);
    expect(req.methodDetails?.chainId).toBe(42431);
    expect(challenge.meta?.orderId ?? JSON.stringify(challenge)).toContain(orderId);

    const o = await order(orderId);
    expect(o.body.status).toBe("CREATED");
    expect(o.body.receipt).toBeUndefined();
  });

  it("rejects a forged credential with another 402, without paying the order", async () => {
    const q = await quote({ provider: "telcel", phone: "5512345678", amountMxn: 50 });
    const first = await pay({ quoteId: q.body.quoteId, idempotencyKey: "idem-402-test-0002" });
    const challenge = Challenge.deserialize(first.headers.get("WWW-Authenticate")!);
    const forged = { ...challenge, request: { ...(challenge.request as object), amount: "1" } };
    const { Credential } = await import("mppx");
    const cred = Credential.serialize({ challenge: forged as any, payload: { type: "hash", hash: `0x${"ab".repeat(32)}` } });
    const res = await pay({ quoteId: q.body.quoteId, idempotencyKey: "idem-402-test-0002" }, `Payment ${cred}`);
    expect(res.status).toBe(402);
    const o = await order("idem-402-test-0002");
    expect(o.body.status).toBe("CREATED");
  });

  it("R-011: a push payment whose credential never arrived is found via the issued challenge, not charged again", async () => {
    const q = await quote({ provider: "telcel", phone: "5512345678", amountMxn: 30 });
    const k = "idem-402-test-0003";
    const first = await pay({ quoteId: q.body.quoteId, idempotencyKey: k });
    expect(first.status).toBe(402);
    const issued = Challenge.deserialize(first.headers.get("WWW-Authenticate")!).id;
    // the wallet paid that challenge on-chain, but its credential POST was lost
    findSettled.mockImplementation(async (p) =>
      p.attempts.some((a) => a.challengeId === issued && a.kind === "issued")
        ? { txHash: `0x${"cd".repeat(32)}`, payer: "0x4444444444444444444444444444444444444444", challengeId: issued }
        : null,
    );
    const retry = await pay({ quoteId: q.body.quoteId, idempotencyKey: k });
    expect(retry.status).toBe(200);
    const body = await retry.json();
    expect(body.status).toBe("FULFILLED_SIMULATED");
    expect(body.receipt.txHash).toBe(`0x${"cd".repeat(32)}`);
    findSettled.mockReset();
  });
});
