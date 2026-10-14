import { describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";

vi.mock("../chain", () => ({
  publicClient: () => ({
    readContract: async () => {
      throw new Error("RPC unavailable (test)");
    },
  }),
}));

import { ATTESTATION_TTL_SECONDS, assessDriver, canonicalJson, verifyEligibility } from "../credit";

const KEY = generatePrivateKey();
const SIGNER = privateKeyToAccount(KEY).address;
const POOL: Address = "0x000000000000000000000000000000000000bEEF";
const BORROWER: Address = "0x1111111111111111111111111111111111111111";
const base = { pool: POOL, signerKey: KEY, expectedSigner: SIGNER, chainId: 42431, borrowCapacityMxn: 100_000 } as const;

describe("credit score", () => {
  it("is deterministic for the same fixture and borrower (nonce aside)", async () => {
    const a = await assessDriver(BORROWER, "steady", base);
    const b = await assessDriver(BORROWER, "steady", base);
    expect(a.score).toBe(b.score);
    expect(a.features).toEqual(b.features);
    expect(a.explanation).toEqual(b.explanation);
    expect(a.dataHash).toBe(b.dataHash);
    expect(a.maxAmount).toBe(b.maxAmount);
    expect(a.attestation!.nonce).not.toBe(b.attestation!.nonce);
  });

  it("binds dataHash to the borrower", async () => {
    const a = await assessDriver(BORROWER, "steady", base);
    const b = await assessDriver("0x2222222222222222222222222222222222222222", "steady", base);
    expect(a.dataHash).not.toBe(b.dataHash);
  });

  it("steady: eligible at the 1,500 xMXN ceiling", async () => {
    const r = await assessDriver(BORROWER, "steady", base);
    expect(r.demo).toBe(true);
    expect(r.eligible).toBe(true);
    expect(r.maxAmount).toBe("1500000000");
    expect(r.capReason).toBe("absolute-cap");
    expect(r.attestation?.maxAmount).toBe("1500000000");
  });

  it("irregular: eligible with a smaller income-share cap", async () => {
    const r = await assessDriver(BORROWER, "irregular", base);
    expect(r.eligible).toBe(true);
    expect(r.capReason).toBe("income-share");
    expect(BigInt(r.maxAmount)).toBeGreaterThan(0n);
    expect(BigInt(r.maxAmount)).toBeLessThan(1_000_000_000n);
    expect(r.score).toBeGreaterThanOrEqual(r.scoreFloor);
  });

  it("new-driver: ineligible (too few active weeks), no attestation", async () => {
    const r = await assessDriver(BORROWER, "new-driver", base);
    expect(r.eligible).toBe(false);
    expect(r.maxAmount).toBe("0");
    expect(r.attestation).toBeUndefined();
    expect(r.explanation.join(" ")).toMatch(/active weeks/);
  });

  it("reports what the pool can lend now (R-006) and withholds the attestation at zero capacity", async () => {
    const low = await assessDriver(BORROWER, "steady", { ...base, borrowCapacityMxn: 60 });
    expect(low.maxAmount).toBe("1500000000"); // the credit line is still attested in full
    expect(low.availableToBorrow).toBe("60000000");
    expect(low.attestation?.maxAmount).toBe("1500000000");
    const full = await assessDriver(BORROWER, "steady", base);
    expect(full.availableToBorrow).toBe("1500000000");
    const empty = await assessDriver(BORROWER, "steady", { ...base, borrowCapacityMxn: 0 });
    expect(empty.eligible).toBe(true);
    expect(empty.availableToBorrow).toBe("0");
    expect(empty.attestation).toBeUndefined();
    expect(empty.attestationWithheld).toMatch(/capacity/);
  });

  it("withholds the attestation when pool capacity can't be read (R-001)", async () => {
    const r = await assessDriver(BORROWER, "steady", { pool: POOL, signerKey: KEY, expectedSigner: SIGNER, chainId: 42431 });
    expect(r.eligible).toBe(true);
    expect(r.attestation).toBeUndefined();
    expect(r.attestationWithheld).toMatch(/capacity/);
  });

  it("withholds the attestation when the pool isn't deployed", async () => {
    const r = await assessDriver(BORROWER, "steady", { pool: undefined, signerKey: KEY, expectedSigner: SIGNER, chainId: 42431, borrowCapacityMxn: null });
    expect(r.attestation).toBeUndefined();
    expect(r.attestationWithheld).toBeTruthy();
  });
});

describe("eligibility attestation", () => {
  it("withholds the attestation if this server's key isn't the signer the pool trusts", async () => {
    const other = privateKeyToAccount(generatePrivateKey()).address;
    const r = await assessDriver(BORROWER, "steady", { ...base, expectedSigner: other });
    expect(r.eligible).toBe(true);
    expect(r.attestation).toBeUndefined();
    expect(r.attestationWithheld).toMatch(/signing key/);
  });

  it("signature recovers to the attestation signer over the EIP-712 domain", async () => {
    const r = await assessDriver(BORROWER, "steady", base);
    const att = r.attestation!;
    expect(att.signer).toBe(SIGNER);
    expect(att.pool).toBe(POOL);
    expect(att.chainId).toBe(42431);
    expect(att.dataHash).toBe(r.dataHash);
    expect(await verifyEligibility(att, SIGNER)).toEqual({ ok: true });
  });

  it("rejects a tampered amount or a different signer", async () => {
    const att = (await assessDriver(BORROWER, "steady", base)).attestation!;
    expect(await verifyEligibility({ ...att, maxAmount: "1500000001" }, SIGNER)).toEqual({ ok: false, reason: "bad-signer" });
    expect(await verifyEligibility({ ...att, borrower: SIGNER }, SIGNER)).toEqual({ ok: false, reason: "bad-signer" });
    const other = privateKeyToAccount(generatePrivateKey()).address;
    expect(await verifyEligibility(att, other)).toEqual({ ok: false, reason: "bad-signer" });
  });

  it("expires after ~15 minutes", async () => {
    const now = 1_800_000_000;
    const att = (await assessDriver(BORROWER, "steady", { ...base, now })).attestation!;
    expect(att.expiry).toBe(now + ATTESTATION_TTL_SECONDS);
    expect(ATTESTATION_TTL_SECONDS).toBe(900);
    expect(await verifyEligibility(att, SIGNER, now + 899)).toEqual({ ok: true });
    expect(await verifyEligibility(att, SIGNER, now + 900)).toEqual({ ok: false, reason: "expired" });
  });

  it("uses 256-bit random nonces", async () => {
    const att = (await assessDriver(BORROWER, "steady", base)).attestation!;
    expect(BigInt(att.nonce)).toBeLessThan(2n ** 256n);
    expect(BigInt(att.nonce)).toBeGreaterThan(2n ** 128n); // overwhelmingly likely for a uniform draw
  });

  it("canonical JSON sorts keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[2,{"y":2,"z":1}]},"b":1}');
  });
});
