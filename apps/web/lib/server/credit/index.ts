// Credit service: demo earnings → deterministic score → signed, expiring EIP-712 eligibility attestation.
import { formatUnits, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { DEMO_UBER_LABEL, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import type { DriverProfileId, DriverScoreResponse } from "@mercado/shared";
import { getDeployments } from "../deployments";
import { env } from "../env";
import { publicClient } from "../chain";
import { DemoEarningsProvider, type EarningsProvider } from "./provider";
import { SCORE_FLOOR, SCORE_VERSION, scoreDriver } from "./score";
import { ATTESTATION_TTL_SECONDS, randomNonce, reportDataHash, signEligibility } from "./attest";

export * from "./provider";
export * from "./score";
export * from "./attest";

const poolAbi = parseAbi(["function availableLiquidity() view returns (uint256)"]);

export function creditPoolAddress(): Address | undefined {
  return getDeployments().creditPool ?? (env("CREDIT_POOL_ADDRESS") as Address | undefined);
}

/** Pool liquidity in whole xMXN; throws if the pool can't be read. */
export async function readPoolLiquidityMxn(pool: Address): Promise<number> {
  const raw = await publicClient().readContract({ address: pool, abi: poolAbi, functionName: "availableLiquidity" });
  return Number(formatUnits(raw, 6));
}

export interface AssessOptions {
  provider?: EarningsProvider;
  /** Override pool liquidity (tests). `null` = skip the on-chain read. */
  poolLiquidityMxn?: number | null;
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
  // An attestation is only issued once pool liquidity has been read successfully (or injected by a test):
  // never advertise an executable advance we couldn't check against real liquidity.
  let liquidity: number | undefined;
  let liquidityError: string | undefined;
  if (opts.poolLiquidityMxn !== undefined && opts.poolLiquidityMxn !== null) liquidity = opts.poolLiquidityMxn;
  else if (opts.poolLiquidityMxn === undefined && pool) {
    try {
      liquidity = await readPoolLiquidityMxn(pool);
    } catch (err) {
      liquidityError = (err as Error).message.split("\n")[0];
      console.warn("[credit] availableLiquidity() read failed; withholding attestation:", liquidityError);
    }
  }
  const result = scoreDriver(weeks, liquidity);

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
  const maxAmount = parseUnits(String(result.capMxn), 6);

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
    capReason: result.capReason,
    dataHash,
  };

  if (!result.eligible) return response;

  const signerKey = opts.signerKey ?? (env("ATTESTATION_SIGNER_PRIVATE_KEY") as Hex | undefined);
  const withheld = !pool
    ? "the credit pool isn't deployed yet"
    : liquidityError
      ? "pool liquidity couldn't be read right now, try again shortly"
      : liquidity === undefined && opts.poolLiquidityMxn !== null
        ? "pool liquidity is unknown"
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
