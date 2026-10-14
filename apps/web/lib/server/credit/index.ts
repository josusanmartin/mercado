// Credit service: demo earnings → deterministic score → signed, expiring EIP-712 eligibility attestation.
import { formatUnits, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { DEMO_UBER_LABEL, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import type { DriverProfileId, DriverScoreResponse } from "@mercado/shared";
import { activeProtocol } from "../protocol";
import { env } from "../env";
import { publicClient } from "../chain";
import { DemoEarningsProvider, type EarningsProvider } from "./provider";
import { SCORE_FLOOR, SCORE_VERSION, scoreDriver } from "./score";
import { ATTESTATION_TTL_SECONDS, randomNonce, reportDataHash, signEligibility } from "./attest";

export * from "./provider";
export * from "./score";
export * from "./attest";

const poolAbi = parseAbi(["function borrowCapacity(address borrower, uint256 maxAmount) view returns (uint256)"]);

export function creditPoolAddress(): Address | undefined {
  const proto = activeProtocol();
  // v2 fails closed: never sign an attestation for the v1 pool (or an env override) while v2 is active.
  if (proto.version === "v2") return proto.creditPool;
  return proto.creditPool ?? (env("CREDIT_POOL_ADDRESS") as Address | undefined);
}

/**
 * What `borrower` could actually draw right now under an attestation for `maxAmount`
 * (CreditPool.borrowCapacity: attested headroom, per-user cap, idle cash, 80% utilization). Throws if unreadable.
 */
export async function readBorrowCapacity(pool: Address, borrower: Address, maxAmount: bigint): Promise<bigint> {
  return publicClient().readContract({ address: pool, abi: poolAbi, functionName: "borrowCapacity", args: [borrower, maxAmount] });
}

export interface AssessOptions {
  provider?: EarningsProvider;
  /** Override CreditPool.borrowCapacity in whole xMXN (tests). `null` = skip the on-chain read. */
  borrowCapacityMxn?: number | null;
  pool?: Address;
  signerKey?: Hex;
  now?: number; // unix seconds
}

export async function assessDriver(
  borrower: Address,
  profile: DriverProfileId,
  opts: AssessOptions = {},
): Promise<DriverScoreResponse> {
  const provider = opts.provider ?? new DemoEarningsProvider();
  const [driver, weeks, payments] = await Promise.all([
    provider.getDriverProfile(profile),
    provider.getTrips(profile),
    provider.getPayments(profile),
  ]);

  const pool = opts.pool ?? creditPoolAddress();
  const result = scoreDriver(weeks);
  const maxAmount = parseUnits(String(result.capMxn), 6);

  // The income report is kept off-chain; only its hash goes into the attestation.
  const report = {
    schema: "mercado.income-report.v1",
    label: DEMO_UBER_LABEL,
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
    `[credit] borrower=${borrower} profile=${profile} score=${result.score} eligible=${result.eligible} cap=${result.capMxn} reason=${result.capReason} dataHash=${dataHash}`,
    JSON.stringify(result.features),
  );

  const response: DriverScoreResponse = {
    demo: true,
    label: `${DEMO_UBER_LABEL}: illustrative score, not a validated credit model`,
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
            : undefined;
  if (withheld || !pool || !signerKey) {
    response.explanation.push(`No attestation issued: ${withheld ?? "unavailable"}.`);
    response.attestationWithheld = withheld ?? "unavailable";
    return response;
  }

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const expiry = BigInt(now + ATTESTATION_TTL_SECONDS);
  const nonce = randomNonce();
  const { signature, signer } = await signEligibility(signerKey, pool, { borrower, maxAmount, expiry, nonce, dataHash });
  response.attestation = {
    borrower,
    maxAmount: maxAmount.toString(),
    expiry: Number(expiry),
    nonce: nonce.toString(),
    dataHash,
    signature,
    signer,
    pool,
    chainId: TEMPO_MODERATO_CHAIN_ID,
  };
  return response;
}
