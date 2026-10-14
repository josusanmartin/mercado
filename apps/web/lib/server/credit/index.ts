// Credit service: demo earnings → deterministic score → signed, expiring EIP-712 eligibility attestation.
import { formatUnits, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { DEMO_PLATFORM_LABELS } from "@mercado/shared";
import type { DriverPlatform, DriverProfileId, DriverScoreResponse } from "@mercado/shared";
import { requireAddress, serverAddresses } from "../protocol";
import { env } from "../env";
import { publicClient } from "../chain";
import { demoProvider, type EarningsProvider } from "./provider";
import { SCORE_FLOOR, SCORE_VERSION, scoreDriver } from "./score";
import { privateKeyToAccount } from "viem/accounts";
import { recordAttestation } from "./book";
import { ATTESTATION_TTL_SECONDS, randomNonce, reportDataHash, signEligibility } from "./attest";

export * from "./provider";
export * from "./score";
export * from "./attest";
export * from "./book";

const poolAbi = parseAbi(["function borrowCapacity(address borrower, uint256 maxAmount) view returns (uint256)"]);

/** The active protocol's CreditPool (packages/shared/src/protocol.ts). Fails closed: no v1/env fallback. */
export function creditPoolAddress(): Address {
  return requireAddress("creditPool");
}

/**
 * What `borrower` could actually draw right now under an attestation for `maxAmount`
 * (CreditPool.borrowCapacity: attested headroom, per-user cap, idle cash, 80% utilization). Throws if unreadable.
 */
export async function readBorrowCapacity(pool: Address, borrower: Address, maxAmount: bigint): Promise<bigint> {
  return publicClient().readContract({ address: pool, abi: poolAbi, functionName: "borrowCapacity", args: [borrower, maxAmount] });
}

export interface AssessOptions {
  /** Which demo platform's earnings to use (default uber). Ignored when `provider` is given. */
  platform?: DriverPlatform;
  provider?: EarningsProvider;
  /** Override CreditPool.borrowCapacity in whole xMXN (tests). `null` = skip the on-chain read. */
  borrowCapacityMxn?: number | null;
  pool?: Address;
  signerKey?: Hex;
  /** Address the pool trusts (default: the active protocol's attestationSigner). */
  expectedSigner?: Address;
  chainId?: number;
  now?: number; // unix seconds
}

export async function assessDriver(
  borrower: Address,
  profile: DriverProfileId,
  opts: AssessOptions = {},
): Promise<DriverScoreResponse> {
  const provider = opts.provider ?? demoProvider(opts.platform ?? "uber");
  const platform = provider.platform;
  const [driver, weeks, payments] = await Promise.all([
    provider.getDriverProfile(profile),
    provider.getTrips(profile),
    provider.getPayments(profile),
  ]);

  const pool = "pool" in opts ? opts.pool : creditPoolAddress();
  const chainId = opts.chainId ?? serverAddresses().chainId;
  const result = scoreDriver(weeks);
  const maxAmount = parseUnits(String(result.capMxn), 6);

  // The income report is kept off-chain; only its hash goes into the attestation.
  const report = {
    schema: "mercado.income-report.v1",
    label: DEMO_PLATFORM_LABELS[platform],
    platform,
    source: provider.id,
    profile,
    borrower: borrower.toLowerCase(),
    driverId: driver.driverId,
    weeks,
    payments,
    scoreVersion: SCORE_VERSION,
    features: result.features,
    score: result.score,
  };
  const dataHash = reportDataHash(report);

  console.info(
    `[credit] borrower=${borrower} platform=${platform} profile=${profile} score=${result.score} eligible=${result.eligible} cap=${result.capMxn} reason=${result.capReason} dataHash=${dataHash}`,
    JSON.stringify(result.features),
  );

  const response: DriverScoreResponse = {
    demo: true,
    label: `${DEMO_PLATFORM_LABELS[platform]}: illustrative score, not a validated credit model`,
    platform,
    profile,
    eligible: result.eligible,
    score: result.score,
    scoreFloor: SCORE_FLOOR,
    features: result.features,
    explanation: result.explanation,
    maxAmount: maxAmount.toString(),
    availableToBorrow: "0",
    capReason: result.capReason,
    dataHash,
  };

  if (!result.eligible) return response;

  // Only attest once we've read what the pool can actually lend this borrower right now: never
  // advertise an executable advance we couldn't check against real on-chain capacity (R-001, R-006).
  let capacity: bigint | undefined;
  let capacityError: string | undefined;
  if (typeof opts.borrowCapacityMxn === "number") {
    const injected = parseUnits(String(opts.borrowCapacityMxn), 6);
    capacity = injected < maxAmount ? injected : maxAmount;
  } else if (opts.borrowCapacityMxn === undefined && pool) {
    try {
      capacity = await readBorrowCapacity(pool, borrower, maxAmount);
    } catch (err) {
      capacityError = (err as Error).message.split("\n")[0];
      console.warn("[credit] borrowCapacity() read failed; withholding attestation:", capacityError);
    }
  }
  if (capacity !== undefined) {
    response.availableToBorrow = capacity.toString();
    if (capacity < maxAmount)
      response.explanation.push(
        capacity === 0n
          ? "Nothing can be drawn right now: pool liquidity/utilization limit reached or your line is fully used. Repay or try later."
          : `You can draw up to ${formatUnits(capacity, 6)} xMXN right now (limited by pool liquidity/utilization or your outstanding advance).`,
      );
  }

  const signerKey = opts.signerKey ?? (env("ATTESTATION_SIGNER_PRIVATE_KEY") as Hex | undefined);
  const withheld = !pool
    ? "the credit pool isn't deployed yet"
    : capacityError
      ? "pool capacity couldn't be read right now, try again shortly"
      : capacity === undefined
        ? "pool capacity is unknown"
        : capacity === 0n
          ? "no borrowing capacity available right now"
          : !signerKey
            ? "the attestation signer key is not configured"
            : !signerMatches(signerKey, opts.expectedSigner ?? serverAddresses().attestationSigner)
              ? "this server's signing key isn't the one the credit pool trusts"
              : undefined;
  if (withheld || !pool || !signerKey) {
    response.explanation.push(`No attestation issued: ${withheld ?? "unavailable"}.`);
    response.attestationWithheld = withheld ?? "unavailable";
    return response;
  }

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const expiry = BigInt(now + ATTESTATION_TTL_SECONDS);
  const nonce = randomNonce();
  const { signature, signer } = await signEligibility(signerKey, pool, { borrower, maxAmount, expiry, nonce, dataHash }, chainId);
  await recordAttestation({
    at: new Date().toISOString(),
    protocol: serverAddresses().protocol,
    pool,
    borrower,
    platform,
    profile,
    score: result.score,
    maxAmount: maxAmount.toString(),
    expiry: Number(expiry),
    nonce: nonce.toString(),
    dataHash,
  }).catch((e) => console.warn("[credit] attestation ledger write failed:", (e as Error).message));
  response.attestation = {
    borrower,
    maxAmount: maxAmount.toString(),
    expiry: Number(expiry),
    nonce: nonce.toString(),
    dataHash,
    signature,
    signer,
    pool,
    chainId,
  };
  return response;
}

function signerMatches(key: Hex, expected: Address | undefined): boolean {
  if (!expected) return false;
  return privateKeyToAccount(key).address.toLowerCase() === expected.toLowerCase();
}
