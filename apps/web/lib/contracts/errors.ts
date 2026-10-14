// Turns viem/wagmi errors into one readable sentence for the UI.
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, decodeErrorResult, type Hex } from "viem";
import { allErrorsAbi } from "./abis";
import { ADDR } from "./addresses";

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
  // oracle (admin-relayed USD/MXN rate)
  StalePrice: () => "The exchange rate (admin-relayed) is stale, so minting, withdrawing against debt and swaps are paused until it updates.",
  OraclePaused: () => "The exchange rate feed (admin-relayed) is paused.",
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
  // v2 vault (Mint)
  DebtCeilingExceeded: ([, ceiling]) => `This collateral's debt ceiling (${amt(ceiling)} xMXN) would be exceeded.`,
  MintingPaused: () => "Minting against this collateral is paused. You can still repay and withdraw.",
  UnknownCollateral: () => "That token isn't accepted as collateral.",
  // MoveAMM (exchange)
  CoverageTooLow: ([cov, req]) => `The exchange's reserve coverage would be ${pct(cov)} (minimum ${pct(req)}), so minting is paused for now.`,
  ExceedsLiability: ([liab]) => `The exchange can redeem at most ${amt(liab)} xMXN right now.`,
  InsufficientReserve: ([r]) => `The exchange only has ${amt(r)} OUSD in reserve.`,
  RedeemCapExceeded: ([, cap]) => `Redemptions are rate-limited (${amt(cap)} OUSD at once, refilling over 24h). Try a smaller amount or later.`,
  LiabilityCeiling: () => "The exchange has reached its issuance ceiling.",
  // Mercado Card: Spanish only (lead 07:12), the holder reads these on the phone and at the POS
  CardIsFrozen: () => "Tarjeta congelada. Descongélala para pagar.",
  OverDailyLimit: ([after, limit]) => `Supera tu límite diario: ${amt(after)} de ${amt(limit)} xMXN. Se renueva a medianoche, hora CDMX.`,
  TapExpired: () => "Autorización vencida. Toca de nuevo para aprobar.",
  TapReplayed: () => "Esta autorización ya se usó. Toca de nuevo.",
  BadTapSignature: () => "Firma no válida: la aprobación del titular no coincide con este cobro.",
  NotMerchant: () => "Terminal no autorizada para cobrar con Mercado Card.",
  NotHolder: () => "Solo el titular puede cambiar esta tarjeta.",
  InvalidLimit: () => "Límite no válido: elige entre 1 y 100,000 xMXN.",
  RefundTooLarge: ([refundable]) => `Reembolso mayor al cobro: puedes reembolsar hasta ${amt(refundable)} xMXN.`,
  NotChargeMerchant: () => "Solo el comercio que hizo este cobro puede reembolsarlo.",
  UnknownCard: () => "Tarjeta no encontrada.",
  // InvestDesk (Invest)
  InsufficientInventory: ([avail]) => `The T-bill desk only has ${amt(avail)} available right now.`,
  ExceedsBoughtBalance: ([bought]) => `The desk buys back only what you bought here (${amt(bought)} tTBILL).`,
  TradeTooLarge: ([, max]) => `Max ${amt(max)} USD per trade.`,
  FeedPaused: () => "The demo T-bill price feed is paused.",
  // TIP-20
  InsufficientBalance: ([bal, need]) => `Insufficient balance: you have ${amt(bal)}, need ${amt(need)}.`,
  InsufficientAllowance: () => "The token allowance is too low. Approve first.",
  Unauthorized: () => "This account isn't authorized for that action.",
  ContractPaused: () => "The token is paused.",
  PolicyForbids: () => "The token's transfer policy blocks this transfer.",
};

/** Spanish for the shared errors when the failing call is a Mercado Card call (charge, freeze, limit…). */
const MESSAGES_ES: Record<string, (args: readonly unknown[]) => string> = {
  InsufficientBalance: ([bal, need]) => `Saldo insuficiente: tienes ${amt(bal)} xMXN y necesitas ${amt(need)}.`,
  InsufficientAllowance: () => "Tu autorización de gasto es muy baja. Autoriza primero.",
  ZeroAmount: () => "Ingresa un monto mayor a cero.",
  Unauthorized: () => "Esta cuenta no está autorizada para esa acción.",
  ContractPaused: () => "La tarjeta está en pausa por un momento. Intenta de nuevo.",
  EnforcedPause: () => "La tarjeta está en pausa por un momento. Intenta de nuevo.",
  PolicyForbids: () => "La política del token bloquea esta transferencia.",
};

/** The contract a failing call targeted (viem's ContractFunctionExecutionError carries it). */
function failingContract(err: BaseError): string | undefined {
  let to: string | undefined;
  err.walk((e) => {
    const a = (e as { contractAddress?: unknown }).contractAddress;
    if (typeof a === "string") to = a.toLowerCase();
    return false;
  });
  return to;
}

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

/**
 * One human sentence for any wallet/RPC/contract error. Card calls (or `lang: "es"`) read Spanish:
 * the Card errors are always Spanish, and the shared token errors switch to Spanish for the cardholder.
 */
export function readableError(error: unknown, opts?: { lang?: "es" | "en" }): string {
  if (!error) return "";
  if (error instanceof BaseError) {
    const es = opts?.lang === "es" || (opts?.lang !== "en" && failingContract(error) === ADDR.card.toLowerCase());
    if (error.walk((e) => e instanceof UserRejectedRequestError))
      return es ? "Rechazaste la solicitud en tu billetera." : "You rejected the request in your wallet.";
    const decoded = decodeRevert(error);
    if (decoded)
      return (es ? MESSAGES_ES[decoded.name] : undefined)?.(decoded.args) ?? MESSAGES[decoded.name]?.(decoded.args) ?? `Transaction reverted: ${decoded.name}.`;
    if (/FeeTokenNotUsd|fee token/i.test(error.message))
      return "Fees must be paid in a USD stablecoin (e.g. AlphaUSD). Check the wallet's fee token.";
    return error.shortMessage || error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
