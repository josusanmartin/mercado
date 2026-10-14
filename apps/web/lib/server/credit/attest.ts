// EIP-712 eligibility attestations for CreditPool.borrow (see INTERFACES.md → ICreditPool).
import { keccak256, toHex, type Address, type Hex } from "viem";
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
