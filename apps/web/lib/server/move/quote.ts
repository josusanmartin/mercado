// MOVE module: indicative FX quotes for remittances / cross-border payments.
// Prices from the v2 vault-integrated vAMM when v2 is the active protocol (lib/server/protocol.ts), otherwise
// from the v1 capped SwapDesk at the (mock admin) oracle price. Quotes are indicative: on-chain execution is bound only by
// the swap's own minOut. No comparison against real-world remittance pricing is made here.
import { BaseError, ContractFunctionRevertedError, formatUnits, parseAbi, parseUnits, type Address } from "viem";
import { TEMPO_MODERATO_CHAIN_ID, fxOracleAdapterAbi, swapDeskAbi } from "@mercado/shared";
import type { MoveQuoteResponse, MoveSide } from "@mercado/shared";
import { publicClient } from "../chain";
import { getDeployments } from "../deployments";
import { activeProtocol } from "../protocol";

export const QUOTE_TTL_SECONDS = 30;
const SLIPPAGE_BPS = 50n;
const BPS = 10_000;

/** Proposed v2 view (see #mercado, coordinated with contracts). */
const vammAbi = parseAbi([
  "function quote(bool usdToMxn, uint256 amountIn) view returns (uint256 amountOut, uint256 fee, uint256 midPrice, uint256 impactBps)",
]);

export class MoveQuoteError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const REASONS: Record<string, string> = {
  SwapTooLarge: "That's above the venue's per-swap size limit.",
  InsufficientReserves: "The venue doesn't have enough output inventory for that size right now.",
  StalePrice: "The FX feed (testnet mock oracle) is stale, so quoting is paused until it updates.",
  OraclePaused: "The FX feed (testnet mock oracle) is paused.",
  InvalidPrice: "The FX feed has no valid price.",
  PriceOutOfBand: "The FX price is outside the sanity band.",
  ZeroAmount: "Amount is too small.",
  EnforcedPause: "The venue is paused for a moment (FX stress demo). Try again shortly.",
};

function revertName(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const r = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
  return r?.data?.errorName;
}

export async function quoteMove(side: MoveSide, amount: string, now = Math.floor(Date.now() / 1000)): Promise<MoveQuoteResponse> {
  const d = getDeployments();
  // One protocol version end to end (R: never mix v1/v2 tokens or venues). v1 until lead flips it.
  const proto = activeProtocol();
  const ousd = d.ousd as Address | undefined;
  const xmxn = proto.xmxn;
  if (!ousd || !xmxn || !d.oracle) throw new MoveQuoteError(503, "Contracts aren't deployed yet.", "NOT_DEPLOYED");
  const usdToMxn = side === "usd_to_mxn";
  const amountIn = parseUnits(amount, 6);
  if (amountIn === 0n) throw new MoveQuoteError(400, "Amount must be greater than zero.", "ZERO_AMOUNT");
  const client = publicClient();

  // Oracle (never reverts via peek) for labels and the mid.
  const [px, , valid] = await client.readContract({ address: d.oracle, abi: fxOracleAdapterAbi, functionName: "peek" });
  const isMock = await client
    .readContract({ address: d.oracle, abi: fxOracleAdapterAbi, functionName: "isMock" })
    .catch(() => true);

  let source: MoveQuoteResponse["source"];
  let venue: Address;
  let amountOut: bigint;
  let fee: bigint;
  let mid: bigint = px;
  let impactBps: number | undefined;
  try {
    if (proto.version === "v2") {
      source = "v2-vamm";
      venue = proto.amm;
      const [out, f, m, impact] = await client.readContract({ address: proto.amm, abi: vammAbi, functionName: "quote", args: [usdToMxn, amountIn] });
      [amountOut, fee, mid, impactBps] = [out, f, m, Number(impact)];
    } else {
      if (!proto.swapDesk) throw new MoveQuoteError(503, "No MOVE venue is deployed yet.", "NOT_DEPLOYED");
      source = "v1-swapdesk";
      venue = proto.swapDesk;
      [amountOut, fee] = await client.readContract({ address: proto.swapDesk, abi: swapDeskAbi, functionName: "quote", args: [usdToMxn, amountIn] });
    }
  } catch (err) {
    if (err instanceof MoveQuoteError) throw err;
    const name = revertName(err);
    if (name) throw new MoveQuoteError(422, REASONS[name] ?? `The venue rejected this quote (${name}).`, name);
    throw new MoveQuoteError(502, "Couldn't reach Tempo to price this quote. Try again.", "RPC_ERROR");
  }

  // Value of the input at the oracle mid, in output units.
  const midOut = usdToMxn ? (amountIn * mid) / 100_000_000n : (amountIn * 100_000_000n) / mid;
  const effectiveSpreadBps = midOut > 0n ? Number(((midOut - amountOut) * BigInt(BPS * 100)) / midOut) / 100 : 0;
  const feeBps = amountOut + fee > 0n ? Number((fee * BigInt(BPS * 100)) / (amountOut + fee)) / 100 : 0;
  const sizeImpactBps = impactBps ?? Math.max(0, Math.round((effectiveSpreadBps - feeBps) * 100) / 100);
  const midRate = Number(mid) / 1e8;

  return {
    demo: true,
    protocol: proto.version,
    chainId: TEMPO_MODERATO_CHAIN_ID,
    side,
    source,
    venue,
    tokenIn: usdToMxn ? ousd : xmxn,
    tokenOut: usdToMxn ? xmxn : ousd,
    symbolIn: usdToMxn ? "OUSD" : "xMXN",
    symbolOut: usdToMxn ? "xMXN" : "OUSD",
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
    fee: fee.toString(),
    rate: Number(formatUnits(amountOut, 6)) / Number(formatUnits(amountIn, 6)),
    oracleMid: mid.toString(),
    oracleMidRate: midRate,
    effectiveSpreadBps,
    feeBps,
    sizeImpactBps,
    minOutSuggested: ((amountOut * (10_000n - SLIPPAGE_BPS)) / 10_000n).toString(),
    quotedAt: now,
    expiresAt: now + QUOTE_TTL_SECONDS,
    firm: false,
    isMock,
    oracleStale: !valid,
    label:
      (source === "v1-swapdesk"
        ? "Demo quote from the capped testnet swap desk (v1 fallback), not a market."
        : "Demo quote from the testnet vault vAMM.") +
      ` Priced off ${isMock ? "an admin-controlled mock FX feed" : "the on-chain FX oracle"}; testnet OUSD has no real value and xMXN is not redeemable for pesos. Indicative: execution is bound only by your swap's minOut.`,
  };
}
