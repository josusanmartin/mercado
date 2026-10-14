// CR-06: one-shot paid APIs (signed partner quote) persist the paid intent before any post-payment read, so a
// failed read returns the Payment-Receipt and a retry with the SAME credential recovers without a new charge.
// mppx charge + credential parsing and the chain quote are stubbed (no testnet calls).
import { beforeEach, describe, expect, it, vi } from "vitest";

const TX = `0x${"ab".repeat(32)}`;
let paidNext = true;
const chargeStub = vi.fn(async () =>
  paidNext
    ? {
        paid: true as const,
        txHash: TX as `0x${string}`,
        receiptHeader: `receipt-${TX}`,
        receipt: { method: "tempo", reference: TX, status: "success" as const, timestamp: "" },
        payer: "0x3333333333333333333333333333333333333333" as const,
      }
    : { paid: false as const, challenge: new Response("{}", { status: 402, headers: { "WWW-Authenticate": "Payment stub" } }) },
);
// "Payment cred:<challengeId>" is treated as one of OUR verified credentials
const ownCredentialStub = (r: Request) => {
  const h = r.headers.get("Authorization");
  return h?.startsWith("Payment cred:") ? { kind: "transaction", challengeId: h.slice("Payment cred:".length) } : null;
};
vi.mock("../../mpp/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mpp/server")>()),
  charge: () => chargeStub(),
  ownCredential: (r: Request) => ownCredentialStub(r),
  billPaymentToken: () => ({ address: "0x20C0000000000000000000004fE3A8219136ca54", symbol: "xMXN" }),
  merchantAddress: () => "0x6727000000000000000000000000000000d4d3",
}));

let quoteCalls = 0;
let failOnCall: number | null = null;
vi.mock("../move/quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../move/quote")>()),
  quoteMove: async (side: string, amount: string) => {
    quoteCalls++;
    if (failOnCall === quoteCalls) throw new Error("RPC timeout after confirmed payment");
    return { demo: true, side, amountIn: amount, amountOut: "4575000000", symbolOut: "xMXN", protocol: "v2", rate: 18.3 };
  },
}));

import { GET } from "@/app/api/move/quote/route";
import { paidCalls } from "../../mpp/ledger";

const call = (amount: string, auth?: string) =>
  GET(
    new Request(`http://localhost:3100/api/move/quote?side=usd_to_mxn&amount=${amount}&access=partner`, {
      headers: auth ? { Authorization: auth } : {},
    }),
  );

beforeEach(() => {
  chargeStub.mockClear();
  quoteCalls = 0;
  failOnCall = null;
  paidNext = true;
  process.env.ATTESTATION_SIGNER_PRIVATE_KEY = `0x${"11".repeat(32)}`;
});

describe("CR-06 paid partner quote", () => {
  it("refuses BEFORE the 402 when the signing key is missing (nothing charged)", async () => {
    process.env.ATTESTATION_SIGNER_PRIVATE_KEY = ""; // (delete would let env() re-load the repo .env.local)
    const res = await call("250");
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("SIGNER_UNAVAILABLE");
    expect(chargeStub).not.toHaveBeenCalled();
  });

  it("unpaid → 402 challenge", async () => {
    paidNext = false;
    expect((await call("250")).status).toBe(402);
  });

  it("a read failure after payment returns the receipt + a ledger row; the same credential then recovers without a second charge", async () => {
    failOnCall = 2; // 1 = pre-payment price check, 2 = the post-payment quote (review's injected failure)
    const failed = await call("250", "Payment cred:chal-Q1");
    expect(failed.status).toBe(502);
    expect((await failed.json()).code).toBe("PAID_RESULT_PENDING");
    expect(failed.headers.get("Payment-Receipt")).toBe(`receipt-${TX}`);
    expect(chargeStub).toHaveBeenCalledTimes(1);
    const ledger = paidCalls("move-quote");
    expect(ledger.calls.filter((c) => c.txHash === TX)).toHaveLength(1);

    failOnCall = null;
    const retry = await call("250", "Payment cred:chal-Q1");
    expect(retry.status).toBe(200);
    expect(chargeStub).toHaveBeenCalledTimes(1); // no second charge
    expect(retry.headers.get("Payment-Receipt")).toBe(`receipt-${TX}`);
    const body = await retry.json();
    expect(body.signature).toMatch(/^0x[0-9a-f]+$/);
    expect(body.payment.txHash).toBe(TX);
    expect(paidCalls("move-quote").calls.filter((c) => c.txHash === TX)).toHaveLength(1); // still one row
  });

  it("a paid credential can't be reused for a different request", async () => {
    await call("250", "Payment cred:chal-Q2");
    const other = await call("999", "Payment cred:chal-Q2");
    expect(other.status).toBe(409);
    expect((await other.json()).code).toBe("PAYMENT_REQUEST_MISMATCH");
    expect(chargeStub).toHaveBeenCalledTimes(1);
  });
});
