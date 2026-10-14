// Sponsorship policy for /api/sponsor (TESTNET ONLY). We pay fees only for:
//   - chain 42431 (Moderato)
//   - transactions whose every call targets a Mercado contract or token (OUSD, xMXN, vault, desk, pool)
//   - gas ≤ MAX_GAS, maxFeePerGas ≤ MAX_FEE_PER_GAS, tip ≤ MAX_PRIORITY_FEE, gas × maxFeePerGas ≤ MAX_TX_COST (R-013)
//   - fee token unset (sponsor default) or one of FEE_TOKENS
//   - ≤ PER_SENDER_PER_HOUR per sender and ≤ GLOBAL_PER_HOUR overall (in-memory, single process)
import { getAddress, type Address } from "viem";
import { moderatoDeployment, TEMPO_ADDRESSES, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";

export const MAX_GAS = 5_000_000n;
/** Moderato's base fee is ~0.6 gwei (fee units: 1e-18 USD per gas); allow headroom, not a blank cheque. */
export const MAX_FEE_PER_GAS = 5_000_000_000n; // 5 gwei
export const MAX_PRIORITY_FEE = 1_000_000_000n; // 1 gwei
/** gas × maxFeePerGas ceiling: 1e16 = 0.01 USD per sponsored tx (so ≤ $5/h at the global quota). */
export const MAX_TX_COST = 10_000_000_000_000_000n;
export const FEE_TOKENS: ReadonlySet<string> = new Set(
  [TEMPO_ADDRESSES.alphaUSD, TEMPO_ADDRESSES.pathUSD].map((a) => getAddress(a)),
);
export const PER_SENDER_PER_HOUR = 30;
export const GLOBAL_PER_HOUR = 500;
const HOUR = 3_600_000;

export const ALLOWED_TARGETS: ReadonlySet<string> = new Set(
  [
    moderatoDeployment.ousd,
    moderatoDeployment.xMXN,
    moderatoDeployment.vault,
    moderatoDeployment.swapDesk,
    moderatoDeployment.creditPool,
  ].map((a) => getAddress(a)),
);

type Bucket = { start: number; count: number };
const g = globalThis as unknown as { __mercadoSponsor?: { senders: Map<string, Bucket>; global: Bucket } };
const state = (g.__mercadoSponsor ??= { senders: new Map(), global: { start: Date.now(), count: 0 } });

function take(b: Bucket, limit: number, now: number) {
  if (now - b.start >= HOUR) {
    b.start = now;
    b.count = 0;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

type Call = { to?: Address | null };
export type SponsorRequest = {
  from?: Address;
  to?: Address | null;
  calls?: readonly Call[];
  gas?: bigint | number | string;
  maxFeePerGas?: bigint | number | string;
  maxPriorityFeePerGas?: bigint | number | string;
  feeToken?: Address | null;
  chainId?: number | string;
};

const big = (v: bigint | number | string | undefined) => (v === undefined ? undefined : BigInt(v));

/** Returns the reason a request is refused, or undefined if it may be sponsored (without consuming quota). */
export function refusal(req: SponsorRequest): string | undefined {
  const chainId = req.chainId === undefined ? TEMPO_MODERATO_CHAIN_ID : Number(req.chainId);
  if (chainId !== TEMPO_MODERATO_CHAIN_ID) return "wrong chain";
  const targets = req.calls?.length ? req.calls.map((c) => c.to) : [req.to];
  if (targets.length === 0 || targets.some((t) => !t || !ALLOWED_TARGETS.has(getAddress(t))))
    return "target not a Mercado contract";
  const gas = big(req.gas);
  const maxFee = big(req.maxFeePerGas);
  const tip = big(req.maxPriorityFeePerGas);
  if (gas === undefined || maxFee === undefined) return "unfilled gas/fee fields";
  if (gas > MAX_GAS) return "gas too high";
  if (maxFee > MAX_FEE_PER_GAS) return "maxFeePerGas too high";
  if (tip !== undefined && tip > MAX_PRIORITY_FEE) return "priority fee too high";
  if (gas * maxFee > MAX_TX_COST) return "fee cost too high";
  if (req.feeToken && !FEE_TOKENS.has(getAddress(req.feeToken))) return "fee token not allowed";
  if (!req.from) return "missing sender";
  return undefined;
}

/** Consume one sponsorship from the sender's and the global hourly quota. */
export function consumeQuota(sender: Address): boolean {
  const now = Date.now();
  const key = sender.toLowerCase();
  const b = state.senders.get(key) ?? { start: now, count: 0 };
  state.senders.set(key, b);
  if (!take(state.global, GLOBAL_PER_HOUR, now)) return false;
  if (!take(b, PER_SENDER_PER_HOUR, now)) {
    state.global.count--;
    return false;
  }
  return true;
}
