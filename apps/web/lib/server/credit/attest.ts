// EIP-712 eligibility attestations for CreditPool.borrow (see INTERFACES.md → ICreditPool).
import type { EligibilityAttestation } from "@mercado/shared";
import { isAddressEqual, keccak256, recoverTypedDataAddress, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ELIGIBILITY_TYPES = {
  Eligibility: [
    { name: "borrower", type: "address" },
    { name: "maxAmount", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "dataHash", type: "bytes32" },
  ],
} as const;

export const ATTESTATION_TTL_SECONDS = 15 * 60;

export function eligibilityDomain(pool: Address, chainId = 42431) {
  return { name: "MercadoCreditPool", version: "1", chainId, verifyingContract: pool } as const;
}

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("non-finite number in report");
    if (typeof value === "bigint") return JSON.stringify(value.toString());
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function reportDataHash(report: unknown): Hex {
  return keccak256(toHex(canonicalJson(report)));
}

/** Random uint256 from the platform CSPRNG. */
export function randomNonce(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return BigInt(toHex(bytes));
}

export interface EligibilityMessage {
  borrower: Address;
  maxAmount: bigint;
  expiry: bigint;
  nonce: bigint;
  dataHash: Hex;
}

export async function signEligibility(
  privateKey: Hex,
  pool: Address,
  message: EligibilityMessage,
  chainId = 42431,
): Promise<{ signature: Hex; signer: Address }> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData({
    domain: eligibilityDomain(pool, chainId),
    types: ELIGIBILITY_TYPES,
    primaryType: "Eligibility",
    message,
  });
  return { signature, signer: account.address };
}

/**
 * Off-chain mirror of the CreditPool checks: signature recovers to `expectedSigner`, not expired.
 * (Nonce reuse, caps and liquidity are enforced on-chain.)
 */
export async function verifyEligibility(
  att: Pick<EligibilityAttestation, "borrower" | "maxAmount" | "expiry" | "nonce" | "dataHash" | "signature" | "pool" | "chainId">,
  expectedSigner: Address,
  now = Math.floor(Date.now() / 1000),
): Promise<{ ok: true } | { ok: false; reason: "expired" | "bad-signer" }> {
  if (att.expiry <= now) return { ok: false, reason: "expired" };
  const recovered = await recoverTypedDataAddress({
    domain: eligibilityDomain(att.pool as Address, att.chainId),
    types: ELIGIBILITY_TYPES,
    primaryType: "Eligibility",
    message: {
      borrower: att.borrower as Address,
      maxAmount: BigInt(att.maxAmount),
      expiry: BigInt(att.expiry),
      nonce: BigInt(att.nonce),
      dataHash: att.dataHash as Hex,
    },
    signature: att.signature as Hex,
  });
  return isAddressEqual(recovered, expectedSigner) ? { ok: true } : { ok: false, reason: "bad-signer" };
}
