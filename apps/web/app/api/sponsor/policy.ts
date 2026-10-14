// Sponsorship policy for /api/sponsor (TESTNET ONLY). We pay fees only for:
//   - chain 42431 (Moderato)
//   - transactions whose every call targets a Mercado contract or token (OUSD, xMXN, vault, desk, pool)
//   - gas ≤ MAX_GAS
//   - ≤ PER_SENDER_PER_HOUR per sender and ≤ GLOBAL_PER_HOUR overall (in-memory, single process)
import { getAddress, type Address } from "viem";
import { moderatoDeployment, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";

export const MAX_GAS = 5_000_000n;
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
  chainId?: number | string;
};

/** Returns the reason a request is refused, or undefined if it may be sponsored (without consuming quota). */
export function refusal(req: SponsorRequest): string | undefined {
  const chainId = req.chainId === undefined ? TEMPO_MODERATO_CHAIN_ID : Number(req.chainId);
  if (chainId !== TEMPO_MODERATO_CHAIN_ID) return "wrong chain";
  const targets = req.calls?.length ? req.calls.map((c) => c.to) : [req.to];
  if (targets.length === 0 || targets.some((t) => !t || !ALLOWED_TARGETS.has(getAddress(t))))
    return "target not a Mercado contract";
  if (req.gas !== undefined && BigInt(req.gas) > MAX_GAS) return "gas too high";
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
