// V2-SWITCH checklist (api box), read-only, with the protocol forced to v2 in THIS process only
// (the app stays on v1 until lead flips). Run from apps/web so "@/..." resolves:
//   cd apps/web && npx tsx lib/server/__tests__/v2-switch-check.mts
// No funds move: the borrow is an eth_call simulation and the MPP requests stop at the 402 challenge.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.MERCADO_PROTOCOL = "v2";
const tmp = mkdtempSync(path.join(tmpdir(), "mercado-v2-check-"));
process.env.MERCADO_ORDERS_FILE = path.join(tmp, "orders.json");
process.env.MERCADO_MPPX_STORE_FILE = path.join(tmp, "mppx.json");
process.env.MPP_SECRET_KEY = (await import("node:crypto"))
  .randomBytes(32)
  .toString("hex");

const { Challenge } = await import("mppx");
const { creditPoolAbi } = await import("@mercado/shared");
const { serverAddresses } = await import("../protocol");
const { assessDriver, verifyEligibility } = await import("../credit");
const { billPaymentToken, merchantAddress } = await import("../../mpp/server");
const { createQuote, payBill } = await import("../bills/service");
const { getFx } = await import("../fx");
const { quoteMove } = await import("../move/quote");
const { publicClient } = await import("../chain");
const { env } = await import("../env");
const { POST: scorePOST } = await import("@/app/api/driver/score/route");

const a = serverAddresses();
let ok = true;
const check = (name: string, cond: boolean, detail = "") => {
  ok &&= cond;
  console.log(
    `${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
};
const eq = (x?: string, y?: string) =>
  !!x && !!y && x.toLowerCase() === y.toLowerCase();
console.log(
  `protocol ${a.protocol} · xMXN ${a.xMXN} · pool ${a.creditPool} · vamm ${a.vamm} · oracle ${a.oracle}\n`,
);
check("active protocol is v2 in this process", a.protocol === "v2");

// 1. Credit attestation domain: v2 pool + chainId + the signer v2 trusts; borrow simulates OK on the v2 pool.
const driver = env("DRIVER_ADDRESS") as `0x${string}`;
const score = await assessDriver(driver, "steady");
const att = score.attestation;
check(
  "attestation issued for the v2 pool",
  !!att && eq(att.pool, a.creditPool),
  att?.pool ?? score.attestationWithheld,
);
check("attestation chainId", att?.chainId === a.chainId, String(att?.chainId));
check(
  "signer is v2's attestationSigner",
  !!att && eq(att.signer, a.attestationSigner),
  att?.signer,
);
if (att) {
  check(
    "EIP-712 signature verifies for the v2 pool domain",
    (await verifyEligibility(att, a.attestationSigner)).ok,
  );
  const amount =
    BigInt(score.availableToBorrow) < 1_000_000n
      ? BigInt(score.availableToBorrow)
      : 1_000_000n;
  try {
    await publicClient().simulateContract({
      account: driver,
      address: a.creditPool,
      abi: creditPoolAbi,
      functionName: "borrow",
      args: [
        amount,
        BigInt(att.maxAmount),
        BigInt(att.expiry),
        BigInt(att.nonce),
        att.dataHash as `0x${string}`,
        att.signature as `0x${string}`,
      ],
    });
    check(
      "CreditPool v2 accepts the attestation (borrow eth_call)",
      true,
      `${Number(amount) / 1e6} xMXN`,
    );
  } catch (e) {
    check(
      "CreditPool v2 accepts the attestation (borrow eth_call)",
      false,
      (e as Error).message.split("\n")[0],
    );
  }
}

// 2. MPP charge token + recipient (bills): real 402 challenge bound to v2 xMXN and the v2 merchant.
check(
  "bill payment token is v2 xMXN",
  eq(billPaymentToken().address, a.xMXN),
  billPaymentToken().address,
);
check("MPP recipient is v2 merchant", eq(merchantAddress(), a.merchant));
const quote = await createQuote({
  provider: "telcel",
  phone: "5512345678",
  amountMxn: 20,
});
check("bill quote token is v2 xMXN", eq(quote.token, a.xMXN));
const r = await payBill(
  new Request("http://localhost/api/bills/pay", { method: "POST" }),
  { quoteId: quote.quoteId, idempotencyKey: `v2check-${Date.now()}` },
);
if (r.kind === "challenge") {
  const c = Challenge.deserialize(r.response.headers.get("WWW-Authenticate")!);
  const req = c.request as Record<string, any>;
  check(
    "bills 402 challenge currency = v2 xMXN",
    eq(req.currency, a.xMXN),
    req.currency,
  );
  check(
    "bills 402 challenge recipient = v2 merchant",
    eq(req.recipient, a.merchant),
  );
  check(
    "bills 402 challenge chainId",
    req.methodDetails?.chainId === a.chainId,
  );
} else check("bills returns a 402 when unpaid", false);

// 3. /api/fx reads the v2 oracle.
const fx = await getFx();
check(
  "fx reads the v2 oracle",
  eq(fx.oracle, a.oracle),
  `${fx.rate} MXN/USD, ${fx.source}`,
);

// 4. /api/move/quote prices on the v2 vAMM with v2 xMXN.
const mq = await quoteMove("usd_to_mxn", "100");
check(
  "move quote venue = v2 vAMM",
  mq.source === "v2-vamm" && eq(mq.venue, a.vamm),
  `${Number(mq.amountOut) / 1e6} xMXN`,
);
check(
  "move quote token = v2 xMXN, protocol v2",
  eq(mq.tokenOut, a.xMXN) && mq.protocol === "v2",
);

// 5. Underwriter (MPP-paid score): 402 bound to v2 xMXN + merchant.
const uw = await scorePOST(
  new Request("http://localhost/api/driver/score?access=underwriter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ borrower: driver, profile: "steady" }),
  }),
);
if (uw.status === 402) {
  const c = Challenge.deserialize(uw.headers.get("WWW-Authenticate")!);
  const req = c.request as Record<string, any>;
  check(
    "underwriter 402 currency = v2 xMXN",
    eq(req.currency, a.xMXN),
    req.currency,
  );
  check(
    "underwriter 402 recipient = v2 merchant",
    eq(req.recipient, a.merchant),
  );
} else check("underwriter returns a 402 when unpaid", false, String(uw.status));

console.log(`\n${ok ? "GREEN" : "RED"}: api V2-SWITCH box`);
process.exit(ok ? 0 : 1);
