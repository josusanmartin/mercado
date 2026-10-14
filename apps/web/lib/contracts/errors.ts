// Turns viem/wagmi errors into one readable sentence for the UI.
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, decodeErrorResult, type Hex } from "viem";
import { allErrorsAbi } from "./abis";

const pct = (bps: unknown) => `${(Number(bps) / 100).toFixed(2)}%`;
const amt = (v: unknown) => (Number(v) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fx = (v: unknown) => (Number(v) / 1e8).toFixed(2);

const MESSAGES: Record<string, (args: readonly unknown[]) => string> = {
  // vault
  RatioTooLow: ([r, req]) => `That would put your collateral ratio at ${pct(r)}, but at least ${pct(req)} is required.`,
  InsufficientCollateral: ([avail]) => `You only have ${amt(avail)} OUSD of collateral in the vault.`,
  RepayExceedsDebt: ([debt]) => `That's more than your debt (${amt(debt)} xMXN).`,
  PositionHealthy: ([r]) => `This position is healthy (${pct(r)}); it can only be liquidated below 135%.`,
  ZeroAmount: () => "Enter an amount greater than zero.",
  // oracle (mock admin feed)
  StalePrice: () => "The FX feed (mock admin oracle) is stale, so minting, withdrawing against debt and swaps are paused until it updates.",
  OraclePaused: () => "The FX feed (mock admin oracle) is paused.",
  InvalidPrice: () => "The FX feed has no valid price.",
  PriceOutOfBand: ([p]) => `The FX price ${fx(p)} is outside the 5–50 MXN/USD sanity band.`,
  // swap desk
  InsufficientReserves: ([avail, need]) => `The swap desk only has ${amt(avail)} available (needs ${amt(need)}). It's a capped demo desk.`,
  Slippage: ([out, min]) => `Price moved: you'd get ${amt(out)}, below your minimum of ${amt(min)}.`,
  SwapTooLarge: ([, max]) => `Max ${amt(max)} xMXN-equivalent per swap.`,
  DailyCapExceeded: ([, cap]) => `Daily swap limit reached (${amt(cap)} OUSD-equivalent per address per 24h).`,
  EnforcedPause: () => "The swap desk is paused for a moment (FX stress demo). Try again shortly.",
  // credit pool
  InvalidSigner: () => "The eligibility attestation isn't valid for this wallet/pool. Request a fresh one.",
  AttestationExpired: () => "The eligibility attestation expired. Request a fresh one.",
  NonceAlreadyUsed: () => "This attestation was already used. Request a fresh one.",
  ExceedsAttestedMax: ([after, max]) => `That would bring your advance to ${amt(after)} xMXN, above your credit line of ${amt(max)}.`,
  ExceedsUserCap: ([, cap]) => `Advances are capped at ${amt(cap)} xMXN per driver.`,
  ExceedsUtilization: ([, limit]) => `The pool can lend at most ${amt(limit)} xMXN in total right now (80% utilization cap).`,
  InsufficientLiquidity: ([avail]) => `Only ${amt(avail)} xMXN is available in the pool right now.`,
  ExceedsLenderBalance: ([claim]) => `You can withdraw at most ${amt(claim)} xMXN.`,
  // TIP-20
  InsufficientBalance: ([bal, need]) => `Insufficient balance: you have ${amt(bal)}, need ${amt(need)}.`,
  InsufficientAllowance: () => "The token allowance is too low. Approve first.",
  Unauthorized: () => "This account isn't authorized for that action.",
  ContractPaused: () => "The token is paused.",
  PolicyForbids: () => "The token's transfer policy blocks this transfer.",
};

function findRevertData(err: BaseError): Hex | undefined {
  let data: Hex | undefined;
  err.walk((e) => {
    const d = (e as { data?: unknown }).data;
    if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) data = d as Hex;
    else if (d && typeof d === "object" && "data" in d && typeof (d as { data: unknown }).data === "string")
      data = (d as { data: Hex }).data;
    return false;
  });
  return data;
}

/** Decoded custom error name + args, if any. */
export function decodeRevert(error: unknown): { name: string; args: readonly unknown[] } | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
  if (reverted?.data?.errorName) return { name: reverted.data.errorName, args: reverted.data.args ?? [] };
  const raw = reverted?.raw ?? findRevertData(error);
  if (!raw) return undefined;
  try {
    const d = decodeErrorResult({ abi: allErrorsAbi, data: raw });
    return { name: d.errorName, args: (d.args ?? []) as readonly unknown[] };
  } catch {
    return undefined;
  }
}

/** One human sentence for any wallet/RPC/contract error. */
export function readableError(error: unknown): string {
  if (!error) return "";
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You rejected the request in your wallet.";
    const decoded = decodeRevert(error);
    if (decoded) return MESSAGES[decoded.name]?.(decoded.args) ?? `Transaction reverted: ${decoded.name}.`;
    if (/FeeTokenNotUsd|fee token/i.test(error.message))
      return "Fees must be paid in a USD stablecoin (e.g. AlphaUSD). Check the wallet's fee token.";
    return error.shortMessage || error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
