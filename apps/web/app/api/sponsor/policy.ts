// Sponsorship policy for /api/sponsor (TESTNET ONLY, single process, in-memory budgets that reset on restart).
// We pay fees only for:
//   - chain 42431 (Moderato)
//   - calls to the app's own functions: OUSD/xMXN approve (spender = vault/desk/pool), transfer,
//     transferWithMemo; vault, desk and pool user actions. Unknown selectors are refused (R-016).
//   - gas ≤ MAX_GAS, maxFeePerGas ≤ MAX_FEE_PER_GAS, tip ≤ MAX_PRIORITY_FEE, gas × maxFeePerGas ≤ MAX_TX_COST (R-013)
//   - fee token unset (sponsor default) or one of FEE_TOKENS
//   - senders with skin in the game: a demo persona, or an address holding OUSD/xMXN/sOUSD/tTBILL, owing an
//     advance, or holding a Mercado Card. A zero-balance driver's FIRST draw is eligible only when its decoded
//     attestation is fully valid for that sender (validFirstDraw: signer, borrower, expiry, amount, unused nonce). Invented addresses
//     are refused before they touch the quota (R-016 Sybil bound).
//   - ≤ PER_SENDER_PER_HOUR per sender and ≤ GLOBAL_PER_HOUR overall; re-filling the same transaction
//     doesn't consume quota again.
import {
  createPublicClient,
  decodeFunctionData,
  getAddress,
  http,
  parseAbi,
  recoverTypedDataAddress,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  activeAddresses,
  collateralVaultAbi,
  creditPoolAbi,
  mercadoCardAbi,
  investDeskAbi,
  moveAmmAbi,
  multiCollateralVaultAbi,
  stakedOusdAbi,
  swapDeskAbi,
  tempoModerato,
  TEMPO_ADDRESSES,
  TEMPO_MODERATO_CHAIN_ID,
  TEMPO_RPC_URL,
  tip20Abi,
} from "@mercado/shared";

export const MAX_GAS = 5_000_000n;
/** Moderato's base fee is ~0.6 gwei (fee units: 1e-18 USD per gas); allow headroom, not a blank cheque. */
export const MAX_FEE_PER_GAS = 5_000_000_000n; // 5 gwei
export const MAX_PRIORITY_FEE = 1_000_000_000n; // 1 gwei
/** gas × maxFeePerGas ceiling: 1e16 = 0.01 USD per sponsored tx (so ≤ $5/h at the global quota). */
export const MAX_TX_COST = 10_000_000_000_000_000n;
export const PER_SENDER_PER_HOUR = 30;
export const GLOBAL_PER_HOUR = 500;
/** Raw HTTP requests per client IP per minute (bounds fill spam before any signing work). */
export const REQUESTS_PER_IP_PER_MINUTE = 120;
const HOUR = 3_600_000;

export const FEE_TOKENS: ReadonlySet<string> = new Set(
  [TEMPO_ADDRESSES.alphaUSD, TEMPO_ADDRESSES.pathUSD].map((a) => getAddress(a)),
);

// Active protocol only (crew/V2-SWITCH.md): v1 and v2 targets are never sponsored side by side.
const A = activeAddresses();
const sel = (abi: Abi, ...names: string[]) =>
  names.map((n) => {
    const f = abi.find((x) => x.type === "function" && x.name === n);
    if (!f) throw new Error(`sponsor policy: ${n} not in ABI`);
    return toFunctionSelector(f as Parameters<typeof toFunctionSelector>[0]);
  });
const TOKEN_SELECTORS = sel(tip20Abi as Abi, "approve", "transfer", "transferWithMemo");
const APPROVE = TOKEN_SELECTORS[0];
const sym = (s: string) => A.collaterals.find((c) => c.symbol === s)?.token;
const SOUSD = sym("sOUSD");
const TTBILL = sym("tTBILL");
const MIDX = sym("mIDX");

/** target → allowed function selectors */
export const ALLOWED_CALLS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  (
    (A.protocol === "v1"
      ? [
          [A.ousd, TOKEN_SELECTORS],
          [A.xMXN, TOKEN_SELECTORS],
          [A.vault, sel(collateralVaultAbi as Abi, "depositCollateral", "mint", "repayAndBurn", "withdrawCollateral", "liquidate")],
          [A.swapDesk!, sel(swapDeskAbi as Abi, "swapOusdForXmxn", "swapXmxnForOusd", "seed")],
          [A.creditPool, sel(creditPoolAbi as Abi, "supply", "withdrawAvailable", "borrow", "repay")],
        ]
      : [
          [A.ousd, TOKEN_SELECTORS],
          [A.xMXN, TOKEN_SELECTORS],
          [A.vault, sel(multiCollateralVaultAbi as Abi, "depositCollateral", "mint", "repayAndBurn", "withdrawCollateral", "liquidate")],
          [A.vamm!, sel(moveAmmAbi as Abi, "swapOusdForXmxn", "swapXmxnForOusd", "addEquity")],
          [A.creditPool, sel(creditPoolAbi as Abi, "supply", "withdrawAvailable", "borrow", "repay")],
          ...(SOUSD ? [[SOUSD, [...sel(stakedOusdAbi as Abi, "deposit", "redeem", "withdraw"), APPROVE]] as const] : []),
          ...(A.sxMXN ? [[A.sxMXN, sel(stakedOusdAbi as Abi, "deposit", "redeem", "withdraw")] as const] : []),
          // gated tTBILL (no public faucet since R-042): approvals only, to the vault or the InvestDesk
          ...(TTBILL ? [[TTBILL, [APPROVE]] as const] : []),
          ...(A.card ? [[A.card, sel(mercadoCardAbi as Abi, "issueCard", "setDailyLimit", "setFrozen", "charge", "refund")] as const] : []),
          ...(A.investDesk ? [[A.investDesk, sel(investDeskAbi as Abi, "buy", "sell", "buyWithXmxn", "sellForXmxn")] as const] : []),
          ...(A.investDeskIdx ? [[A.investDeskIdx, sel(investDeskAbi as Abi, "buy", "sell", "buyWithXmxn", "sellForXmxn")] as const] : []),
          // gated mIDX (owner-only issuance): approvals only, to the vault or the Stocks desk
          ...(MIDX ? [[MIDX, [APPROVE]] as const] : []),
        ]) as ReadonlyArray<readonly [string, readonly string[]]>
  ).map(([a, s]) => [getAddress(a), new Set<string>(s)]),
);
export const ALLOWED_TARGETS: ReadonlySet<string> = new Set(ALLOWED_CALLS.keys());
/** Approvals are sponsored only toward the active protocol's own contracts. */
const APPROVE_SPENDERS = new Set(
  [A.vault, A.creditPool, A.swapDesk, A.vamm, SOUSD, A.card, A.investDesk, A.investDeskIdx, A.sxMXN].filter((a): a is `0x${string}` => !!a).map((a) => getAddress(a)),
);

// ---------------------------------------------------------------- state (single process)

type Bucket = { start: number; count: number };
type State = {
  senders: Map<string, Bucket>;
  global: Bucket;
  ips: Map<string, Bucket>;
  seen: Map<string, number>; // fill key → time
  eligible: Map<string, { ok: boolean; at: number }>;
};
const g = globalThis as unknown as { __mercadoSponsor2?: State };
const state = (g.__mercadoSponsor2 ??= {
  senders: new Map(),
  global: { start: Date.now(), count: 0 },
  ips: new Map(),
  seen: new Map(),
  eligible: new Map(),
});

function take(b: Bucket, limit: number, now: number, window = HOUR) {
  if (now - b.start >= window) {
    b.start = now;
    b.count = 0;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

// ---------------------------------------------------------------- checks

type Call = { to?: Address | null; data?: Hex | null; input?: Hex | null };
export type SponsorRequest = {
  from?: Address;
  to?: Address | null;
  data?: Hex | null;
  calls?: readonly Call[];
  gas?: bigint | number | string;
  maxFeePerGas?: bigint | number | string;
  maxPriorityFeePerGas?: bigint | number | string;
  feeToken?: Address | null;
  nonce?: bigint | number | string;
  nonceKey?: bigint | number | string;
  chainId?: number | string;
};

const big = (v: bigint | number | string | undefined) => (v === undefined ? undefined : BigInt(v));

function callRefusal(c: Call): string | undefined {
  if (!c.to) return "contract creation not sponsored";
  const allowed = ALLOWED_CALLS.get(getAddress(c.to));
  if (!allowed) return "target not a Mercado contract";
  const data = (c.data ?? c.input ?? "0x").toLowerCase();
  const selector = data.slice(0, 10);
  if (!allowed.has(selector)) return `function ${selector} not sponsored`;
  if (selector === APPROVE) {
    const spender = `0x${data.slice(34, 74)}`;
    if (data.length < 74 || !APPROVE_SPENDERS.has(getAddress(spender))) return "approval spender not a Mercado contract";
  }
  return undefined;
}

/** Synchronous shape/fee checks. Returns the refusal reason, or undefined. */
export function refusal(req: SponsorRequest): string | undefined {
  const chainId = req.chainId === undefined ? TEMPO_MODERATO_CHAIN_ID : Number(req.chainId);
  if (chainId !== TEMPO_MODERATO_CHAIN_ID) return "wrong chain";
  const calls: Call[] = req.calls?.length ? [...req.calls] : [{ to: req.to, data: req.data }];
  for (const c of calls) {
    const why = callRefusal(c);
    if (why) return why;
  }
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

const client = createPublicClient({ chain: tempoModerato, transport: http(TEMPO_RPC_URL) });

const BORROW = sel(creditPoolAbi as Abi, "borrow")[0];

/** Pure rule: a request whose only call is CreditPool.borrow (a driver's draw, attestation-bound). */
export function isBorrowOnly(req: SponsorRequest): boolean {
  const calls: Call[] = req.calls?.length ? [...req.calls] : [{ to: req.to, data: req.data }];
  return (
    calls.length === 1 &&
    !!calls[0].to &&
    getAddress(calls[0].to) === getAddress(A.creditPool) &&
    (calls[0].data ?? calls[0].input ?? "").toLowerCase().startsWith(BORROW)
  );
}

const cardAbiLite = parseAbi(["function cardsOf(address) view returns (uint256[])"]);

/** A zero-balance driver's first draw is sponsored ONLY with a fully valid attestation (review R-016 recheck):
 *  decoded calldata; signature recovers to the pool's live attestationSigner over the EIP-712 Eligibility with
 *  borrower = the sender; not expired; 0 < amount ≤ maxAmount; nonce unused on-chain. Anything else: false. */
export async function validFirstDraw(req: SponsorRequest): Promise<boolean> {
  if (!req.from || !isBorrowOnly(req)) return false;
  const call0 = (req.calls?.length ? req.calls[0] : { to: req.to, data: req.data }) as Call;
  try {
    const { args } = decodeFunctionData({ abi: creditPoolAbi as Abi, data: (call0.data ?? call0.input) as Hex });
    const [amount, maxAmount, expiry, nonce, dataHash, signature] = args as unknown as [bigint, bigint, bigint, bigint, Hex, Hex];
    if (amount === 0n || amount > maxAmount) return false;
    if (BigInt(Math.floor(Date.now() / 1000)) > expiry) return false;
    const signer = await recoverTypedDataAddress({
      domain: { name: "MercadoCreditPool", version: "1", chainId: TEMPO_MODERATO_CHAIN_ID, verifyingContract: A.creditPool },
      types: {
        Eligibility: [
          { name: "borrower", type: "address" },
          { name: "maxAmount", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "dataHash", type: "bytes32" },
        ],
      },
      primaryType: "Eligibility",
      message: { borrower: getAddress(req.from), maxAmount, expiry, nonce, dataHash },
      signature,
    });
    const [poolSigner, used] = await Promise.all([
      client.readContract({ address: A.creditPool, abi: creditPoolAbi, functionName: "attestationSigner" }),
      client.readContract({ address: A.creditPool, abi: creditPoolAbi, functionName: "nonceUsed", args: [getAddress(req.from), nonce] }),
    ]);
    return getAddress(signer) === getAddress(poolSigner as Address) && !used;
  } catch {
    return false;
  }
}

/** Sender has skin in the game (see header). Cached 60s. */
export async function senderEligible(sender: Address, personas: ReadonlySet<string>, req?: SponsorRequest): Promise<boolean> {
  const key = sender.toLowerCase();
  if (personas.has(key)) return true;
  // a new driver's first draw: only with a fully valid attestation for THIS sender (never a bare selector)
  if (req && isBorrowOnly(req) && (await validFirstDraw(req))) return true;
  const hit = state.eligible.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  const [ousd, xmxn, pos, debt] = await Promise.all([
    client.readContract({ address: A.ousd, abi: tip20Abi, functionName: "balanceOf", args: [sender] }),
    client.readContract({ address: A.xMXN, abi: tip20Abi, functionName: "balanceOf", args: [sender] }),
    // v1 vault position only (v2 positions are per collateral; holding OUSD/xMXN already qualifies)
    A.protocol === "v1"
      ? client.readContract({ address: A.vault, abi: collateralVaultAbi, functionName: "getPosition", args: [sender] })
      : Promise.resolve({ collateral: 0n, debt: 0n }),
    client.readContract({ address: A.creditPool, abi: creditPoolAbi, functionName: "getDebt", args: [sender] }),
  ]).catch(() => [0n, 0n, { collateral: 0n, debt: 0n }, 0n] as const);
  let ok = ousd > 0n || xmxn > 0n || pos.collateral > 0n || pos.debt > 0n || debt > 0n;
  if (!ok && A.protocol === "v2") {
    // savers (sOUSD / tTBILL only) and cardholders count too
    const extra = await Promise.all([
      SOUSD ? client.readContract({ address: SOUSD, abi: tip20Abi, functionName: "balanceOf", args: [sender] }) : 0n,
      TTBILL ? client.readContract({ address: TTBILL, abi: tip20Abi, functionName: "balanceOf", args: [sender] }) : 0n,
      MIDX ? client.readContract({ address: MIDX, abi: tip20Abi, functionName: "balanceOf", args: [sender] }) : 0n,
      A.sxMXN ? client.readContract({ address: A.sxMXN, abi: tip20Abi, functionName: "balanceOf", args: [sender] }) : 0n,
      A.card
        ? client.readContract({ address: A.card, abi: cardAbiLite, functionName: "cardsOf", args: [sender] }).then((ids) => BigInt(ids.length))
        : 0n,
    ]).catch(() => [0n, 0n, 0n, 0n, 0n]);
    ok = extra.some((v) => v > 0n);
  }
  state.eligible.set(key, { ok, at: Date.now() });
  return ok;
}

/** Identity of a fill = every field the fee payer signs over (calls, nonce/nonceKey, validBefore/validAfter, gas,
 *  fees, fee token…) plus the sender. Only a byte-identical re-fill is deduped; expiring-nonce txs that differ in
 *  any field (e.g. validBefore) are separate executable txs and each consume quota. */
export function fillKey(req: SponsorRequest): string {
  const skip = new Set(["signature", "feePayerSignature", "hash", "r", "s", "v", "yParity"]);
  const norm = (v: unknown): unknown => {
    if (typeof v === "bigint") return `${v}n`;
    if (typeof v === "string") return v.toLowerCase();
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.keys(v as object)
          .filter((k) => !skip.has(k) && (v as Record<string, unknown>)[k] !== undefined)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    return v;
  };
  return JSON.stringify(norm(req));
}

/** Consume one sponsorship from the sender's and the global hourly quota (no-op for a recently seen fill). */
export function consumeQuota(sender: Address, key: string): boolean {
  const now = Date.now();
  for (const [k, t] of state.seen) if (now - t > HOUR) state.seen.delete(k);
  if (state.seen.has(key)) return true;
  const sk = sender.toLowerCase();
  const b = state.senders.get(sk) ?? { start: now, count: 0 };
  state.senders.set(sk, b);
  if (!take(state.global, GLOBAL_PER_HOUR, now)) return false;
  if (!take(b, PER_SENDER_PER_HOUR, now)) {
    state.global.count--;
    return false;
  }
  state.seen.set(key, now);
  return true;
}

/** Per-IP request limit at ingress (before any filling/signing). */
export function allowIp(ip: string): boolean {
  const now = Date.now();
  const b = state.ips.get(ip) ?? { start: now, count: 0 };
  state.ips.set(ip, b);
  return take(b, REQUESTS_PER_IP_PER_MINUTE, now, 60_000);
}
