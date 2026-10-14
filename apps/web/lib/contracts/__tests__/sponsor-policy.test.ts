// Fee-sponsor policy (app/api/sponsor/policy.ts) against the LIVE v2 deployment manifest: every Card, InvestDesk,
// sOUSD, tTBILL, vault, MoveAMM and CreditPool call a driver/saver/cardholder/merchant needs is sponsored; admin
// functions, foreign approvals and unknown selectors are not.
import { beforeAll, describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi, type Abi, type Address, type Hex } from "viem";

process.env.MERCADO_PROTOCOL = "v2";

type Policy = typeof import("../../../app/api/sponsor/policy");
let P: Policy;
let A: ReturnType<typeof import("@mercado/shared").activeAddresses>;
let abis: typeof import("@mercado/shared");

const FEES = { gas: 300_000n, maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1n, chainId: 42431, from: "0x871aF8b66406F96C6b5f8a156242d9B7a026cC63" as Address };
const call = (to: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): { to: Address; data: Hex } => ({
  to,
  data: encodeFunctionData({ abi, functionName, args } as never),
});
const req = (...calls: { to: Address; data: Hex }[]) => ({ ...FEES, calls });
const sym = (s: string) => A.collaterals.find((c) => c.symbol === s)!.token;
const RANDOM = "0x000000000000000000000000000000000000dEaD" as Address;
const H = `0x${"ab".repeat(32)}` as Hex;

beforeAll(async () => {
  P = await import("../../../app/api/sponsor/policy");
  abis = await import("@mercado/shared");
  A = abis.activeAddresses("v2");
  expect(A.protocol).toBe("v2");
  expect(A.card).toBeTruthy();
  expect(A.investDesk).toBeTruthy();
});

describe("v2 calls drivers, savers, cardholders and merchants need are sponsored", () => {
  it("Mercado Card: holder controls + merchant charge/refund", () => {
    const c = abis.mercadoCardAbi as Abi;
    for (const [fn, args] of [
      ["issueCard", [1_000_000_000n]],
      ["setDailyLimit", [1n, 500_000_000n]],
      ["setFrozen", [1n, true]],
      ["charge", [1n, 45_000_000n, H, 1n, 2_000_000_000n, "0x1234"]],
      ["refund", [1n, 1n]],
    ] as const)
      expect(P.refusal(req(call(A.card!, c, fn, args))), fn).toBeUndefined();
    // holder allowance to the card
    expect(P.refusal(req(call(A.xMXN, erc20Abi, "approve", [A.card!, 2_000_000_000n])))).toBeUndefined();
  });

  it("Mercado Invest: InvestDesk trades + sOUSD savings + tTBILL approvals", () => {
    const d = abis.investDeskAbi as Abi;
    for (const [fn, args] of [
      ["buy", [100_000_000n, 0n]],
      ["sell", [1_000_000n, 0n]],
      ["buyWithXmxn", [100_000_000n, 0n]],
      ["sellForXmxn", [1_000_000n, 0n]],
    ] as const)
      expect(P.refusal(req(call(A.investDesk!, d, fn, args))), fn).toBeUndefined();
    const s = abis.stakedOusdAbi as Abi;
    expect(P.refusal(req(call(sym("sOUSD"), s, "deposit", [1_000_000n, FEES.from])))).toBeUndefined();
    expect(P.refusal(req(call(sym("sOUSD"), s, "redeem", [1_000_000n, FEES.from, FEES.from])))).toBeUndefined();
    expect(P.refusal(req(call(sym("sOUSD"), s, "withdraw", [1_000_000n, FEES.from, FEES.from])))).toBeUndefined();
    // approvals: OUSD → sOUSD / InvestDesk / MoveAMM; tTBILL → InvestDesk / vault; sOUSD → vault
    for (const spender of [sym("sOUSD"), A.investDesk!, A.vamm!, A.vault])
      expect(P.refusal(req(call(A.ousd, erc20Abi, "approve", [spender, 1n]))), spender).toBeUndefined();
    expect(P.refusal(req(call(sym("tTBILL"), erc20Abi, "approve", [A.investDesk!, 1n])))).toBeUndefined();
    expect(P.refusal(req(call(sym("tTBILL"), erc20Abi, "approve", [A.vault, 1n])))).toBeUndefined();
    expect(P.refusal(req(call(sym("sOUSD"), erc20Abi, "approve", [A.vault, 1n])))).toBeUndefined();
  });

  it("Crédito: a driver's draw and repay; Move: mint-to and redeem", () => {
    const pool = abis.creditPoolAbi as Abi;
    expect(P.refusal(req(call(A.creditPool, pool, "borrow", [1n, 2n, 3n, 4n, H, "0x12"])))).toBeUndefined();
    expect(P.refusal(req(call(A.creditPool, pool, "repay", [1n])))).toBeUndefined();
    const amm = abis.moveAmmAbi as Abi;
    expect(P.refusal(req(call(A.vamm!, amm, "swapOusdForXmxn", [1n, 0n, RANDOM])))).toBeUndefined();
    expect(P.refusal(req(call(A.vamm!, amm, "swapXmxnForOusd", [1n, 0n, RANDOM])))).toBeUndefined();
  });

  it("a new driver's first draw (zero balances) is eligible; anything else from that wallet is not by that rule", () => {
    const pool = abis.creditPoolAbi as Abi;
    expect(P.isBorrowOnly(req(call(A.creditPool, pool, "borrow", [1n, 2n, 3n, 4n, H, "0x12"])))).toBe(true);
    expect(P.isBorrowOnly(req(call(A.creditPool, pool, "repay", [1n])))).toBe(false);
    expect(
      P.isBorrowOnly(req(call(A.creditPool, pool, "borrow", [1n, 2n, 3n, 4n, H, "0x12"]), call(A.xMXN, erc20Abi, "transfer", [RANDOM, 1n]))),
    ).toBe(false);
  });
});

describe("refused", () => {
  it("Card / InvestDesk / sOUSD admin functions", () => {
    expect(P.refusal(req(call(A.card!, abis.mercadoCardAbi as Abi, "setMerchant", [RANDOM, true, "x"])))).toMatch(/not sponsored/);
    expect(P.refusal(req(call(A.card!, abis.mercadoCardAbi as Abi, "pause")))).toMatch(/not sponsored/);
    expect(P.refusal(req(call(A.investDesk!, abis.investDeskAbi as Abi, "withdraw", [1n, 1n, RANDOM])))).toMatch(/not sponsored/);
    expect(P.refusal(req(call(A.investDesk!, abis.investDeskAbi as Abi, "setParams", [1n, 1n])))).toMatch(/not sponsored/);
    expect(P.refusal(req(call(sym("sOUSD"), abis.stakedOusdAbi as Abi, "setApr", [1n])))).toMatch(/not sponsored/);
    expect(P.refusal(req(call(sym("sOUSD"), abis.stakedOusdAbi as Abi, "fundYield", [1n])))).toMatch(/not sponsored/);
  });

  it("approvals to anyone but Mercado contracts; tTBILL faucet (gated)", () => {
    expect(P.refusal(req(call(A.xMXN, erc20Abi, "approve", [RANDOM, 1n])))).toMatch(/spender/);
    expect(P.refusal(req(call(sym("tTBILL"), erc20Abi, "approve", [RANDOM, 1n])))).toMatch(/spender/);
    expect(P.refusal(req(call(sym("tTBILL"), abis.demoRwaAbi as Abi, "faucet", [1n])))).toMatch(/not sponsored/);
  });

  it("the inactive v1 desk, non-Mercado targets, and runaway fees", () => {
    const v1 = abis.activeAddresses("v1");
    expect(P.refusal(req(call(v1.swapDesk!, abis.swapDeskAbi as Abi, "swapOusdForXmxn", [1n, 0n])))).toMatch(/target/);
    expect(P.refusal(req(call(RANDOM, erc20Abi, "transfer", [RANDOM, 1n])))).toMatch(/target/);
    expect(P.refusal({ ...req(call(A.card!, abis.mercadoCardAbi as Abi, "setFrozen", [1n, true])), maxFeePerGas: 100_000_000_000n })).toMatch(/maxFeePerGas/);
  });
});

describe("first-draw exception requires a fully valid attestation (review R-016 recheck)", () => {
  const borrowData = (args: readonly unknown[]) => encodeFunctionData({ abi: abis.creditPoolAbi as Abi, functionName: "borrow", args } as never);
  const env = require("node:fs").readFileSync(new URL("../../../../../.env.local", import.meta.url), "utf8") as string;
  const signerPk = env.match(/^ATTESTATION_SIGNER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1] as Hex;

  async function attest(borrower: Address, maxAmount: bigint, expiry: bigint, nonce: bigint, pk: Hex = signerPk) {
    const { privateKeyToAccount } = await import("viem/accounts");
    return privateKeyToAccount(pk).signTypedData({
      domain: { name: "MercadoCreditPool", version: "1", chainId: 42431, verifyingContract: A.creditPool },
      types: { Eligibility: [{ name: "borrower", type: "address" }, { name: "maxAmount", type: "uint256" }, { name: "expiry", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "dataHash", type: "bytes32" }] },
      primaryType: "Eligibility",
      message: { borrower, maxAmount, expiry, nonce, dataHash: H },
    });
  }
  const fresh = "0x1111111111111111111111111111111111111111" as Address;
  const later = BigInt(Math.floor(Date.now() / 1000) + 600);

  it("bare selector / garbage calldata from an invented sender is NOT eligible", async () => {
    expect(await P.validFirstDraw({ ...FEES, from: fresh, calls: [{ to: A.creditPool, data: "0x5e9e1a0b" as Hex }] })).toBe(false);
    expect(await P.validFirstDraw({ ...FEES, from: fresh, calls: [{ to: A.creditPool, data: borrowData([1n, 2n, later, 4n, H, "0x12"]) }] })).toBe(false);
  });

  it("signature from the wrong key, for another borrower, expired, or over the attested max is NOT eligible", async () => {
    const wrongKey = await attest(fresh, 100n, later, 7n, `0x${"77".repeat(32)}`);
    expect(await P.validFirstDraw({ ...FEES, from: fresh, calls: [{ to: A.creditPool, data: borrowData([10n, 100n, later, 7n, H, wrongKey]) }] })).toBe(false);
    const forOther = await attest("0x2222222222222222222222222222222222222222", 100n, later, 7n);
    expect(await P.validFirstDraw({ ...FEES, from: fresh, calls: [{ to: A.creditPool, data: borrowData([10n, 100n, later, 7n, H, forOther]) }] })).toBe(false);
    const past = BigInt(Math.floor(Date.now() / 1000) - 10);
    const expired = await attest(fresh, 100n, past, 7n);
    expect(await P.validFirstDraw({ ...FEES, from: fresh, calls: [{ to: A.creditPool, data: borrowData([10n, 100n, past, 7n, H, expired]) }] })).toBe(false);
    const ok = await attest(fresh, 100n, later, 7n);
    expect(await P.validFirstDraw({ ...FEES, from: fresh, calls: [{ to: A.creditPool, data: borrowData([101n, 100n, later, 7n, H, ok]) }] })).toBe(false);
  });

  it("a real attestation from the pool's signer, for this sender, unexpired, unused nonce IS eligible", async () => {
    const nonce = BigInt(Date.now());
    const sig = await attest(fresh, 100n, later, nonce);
    expect(await P.validFirstDraw({ ...FEES, from: fresh, calls: [{ to: A.creditPool, data: borrowData([50n, 100n, later, nonce, H, sig]) }] })).toBe(true);
  });
});
