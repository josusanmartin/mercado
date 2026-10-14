// Mercado Invest returns, read from the chain (no invented rates):
//   usd / mxn → the savings vaults sOUSD (over OUSD) and sxMXN (over xMXN): the same StakedOUSD contract, so each
//            returns its on-chain configured APR plus the exact accrual state, and a client can tick a balance per frame:
//            totalAssets(t) = assetsAccounted + min(assetsAccounted × aprBps × (t − checkpointAt) / (1e4 × YEAR), fundedReserve)
//   lendingPool → the credit pool's REALIZED APR = fees repaid ÷ time-weighted lender assets, annualized (Crédito's
//            lenders, not Invest). Replays Supplied/Withdrawn/Borrowed/Repaid and reconciles with stats() at the same block.
//   stocks → the equity index token's admin feed price and its change over 24h (null until it is deployed).
import { parseAbi, parseAbiItem, type Address, type Log } from "viem";
import { moderatoDeployment, stakedOusdAbi } from "@mercado/shared";
import { publicClient } from "../chain";
import { requireAddress, serverAddresses } from "../protocol";

const YEAR = 365n * 24n * 3600n;
const CHUNK = 50_000n;
const TTL_MS = 15_000;

const poolEvents = [
  parseAbiItem("event Supplied(address indexed lender, uint256 amount)"),
  parseAbiItem("event Withdrawn(address indexed lender, uint256 amount)"),
  parseAbiItem("event Borrowed(address indexed borrower, uint256 amount, uint256 fee, uint256 nonce, bytes32 dataHash)"),
  parseAbiItem("event Repaid(address indexed borrower, uint256 amount, uint256 remainingDebt)"),
] as const;
const poolReads = parseAbi([
  "function stats() view returns (uint256 totalSupplied, uint256 totalBorrowed, uint256 outstanding, uint256 realizedFees)",
  "function feeBps() view returns (uint256)",
]);
const feedAbi = parseAbi(["function peek() view returns (uint256 px8, uint256 at, bool valid)"]);
const priceUpdated = parseAbiItem("event PriceUpdated(uint256 px8, uint256 updatedAt)");

type TimedLog = Log & { eventName: string; args: Record<string, unknown>; blockTimestamp?: bigint | string | number };
const tsOf = (l: TimedLog) => (l.blockTimestamp === undefined ? undefined : BigInt(l.blockTimestamp));

export type InvestRates = Awaited<ReturnType<typeof compute>>;

let cached: { at: number; value: Promise<InvestRates> } | undefined;

export function getInvestRates(): Promise<InvestRates> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = compute();
  cached = { at: Date.now(), value };
  value.catch(() => (cached = undefined));
  return value;
}

async function compute() {
  const c = publicClient();
  const block = await c.getBlock();
  const [usd, mxn, lendingPool, stocks] = await Promise.all([
    savingsVault("sOUSD", block.number),
    savingsVault("sxMXN", block.number),
    poolRealized(block.number, block.timestamp),
    stocksPrice(block.number, block.timestamp),
  ]);
  return { block: block.number.toString(), blockTimestamp: Number(block.timestamp), usd, mxn, lendingPool, stocks };
}

/** A savings vault of the active protocol: a collateral entry with that symbol, or a top-level v2 deployment key. */
function vaultAddress(symbol: "sOUSD" | "sxMXN"): Address | undefined {
  const a = serverAddresses();
  const fromCollaterals = a.collaterals.find((x) => x.symbol === symbol)?.token;
  if (fromCollaterals) return fromCollaterals;
  if (a.protocol !== "v2") return undefined;
  const v = (moderatoDeployment as { v2?: Record<string, unknown> }).v2?.[symbol];
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined;
}

async function savingsVault(symbol: "sOUSD" | "sxMXN", blockNumber: bigint) {
  const vault = vaultAddress(symbol);
  if (!vault) return null; // not deployed on the active protocol
  const c = publicClient();
  const read = (functionName: "aprBps" | "assetsAccounted" | "fundedReserve" | "checkpointAt" | "totalSupply" | "totalAssets") =>
    c.readContract({ address: vault, abi: stakedOusdAbi, functionName, blockNumber }) as Promise<bigint>;
  const [aprBps, assetsAccounted, fundedReserve, checkpointAt, totalSupply, totalAssets] = await Promise.all([
    read("aprBps"),
    read("assetsAccounted"),
    read("fundedReserve"),
    read("checkpointAt"),
    read("totalSupply"),
    read("totalAssets"),
  ]);
  return {
    token: vault,
    symbol,
    aprBps: Number(aprBps),
    apr: Number(aprBps) / 10_000,
    /** Exact accrual state at `block` (base units, 6 dp). */
    accrual: {
      assetsAccounted: assetsAccounted.toString(),
      fundedReserve: fundedReserve.toString(),
      checkpointAt: Number(checkpointAt),
      totalSupply: totalSupply.toString(),
      totalAssets: totalAssets.toString(),
      yearSeconds: Number(YEAR),
    },
  };
}

async function poolRealized(blockNumber: bigint, now: bigint) {
  const pool = requireAddress("creditPool");
  const c = publicClient();
  const from = BigInt(serverAddresses().startBlock);
  const logs: TimedLog[] = [];
  for (let f = from; f <= blockNumber; f += CHUNK) {
    const to = f + CHUNK - 1n < blockNumber ? f + CHUNK - 1n : blockNumber;
    logs.push(...((await c.getLogs({ address: pool, events: poolEvents, fromBlock: f, toBlock: to })) as unknown as TimedLog[]));
  }
  logs.sort((a, b) => (a.blockNumber! === b.blockNumber! ? a.logIndex! - b.logIndex! : a.blockNumber! < b.blockNumber! ? -1 : 1));

  // Replay: lender assets move on supply (+), withdraw (−) and the fee part of a repayment (+). A borrow moves
  // cash into outstanding principal (no change). Repayments pay the fee first, so the fee part is tracked per borrower.
  const unpaidFee = new Map<string, bigint>();
  let assets = 0n,
    fees = 0n,
    integral = 0n, // Σ assets × seconds
    lastT: bigint | undefined,
    since: bigint | undefined;
  for (const l of logs) {
    const t = tsOf(l);
    if (t === undefined) throw new Error("RPC logs carry no blockTimestamp");
    if (lastT !== undefined) integral += assets * (t - lastT);
    lastT = t;
    const a = l.args;
    if (l.eventName === "Supplied") {
      since ??= t;
      assets += a.amount as bigint;
    } else if (l.eventName === "Withdrawn") assets -= a.amount as bigint;
    else if (l.eventName === "Borrowed") {
      const b = (a.borrower as string).toLowerCase();
      unpaidFee.set(b, (unpaidFee.get(b) ?? 0n) + (a.fee as bigint));
    } else if (l.eventName === "Repaid") {
      const b = (a.borrower as string).toLowerCase();
      const owed = unpaidFee.get(b) ?? 0n;
      const feePart = (a.amount as bigint) < owed ? (a.amount as bigint) : owed;
      unpaidFee.set(b, owed - feePart);
      fees += feePart;
      assets += feePart;
    }
  }
  if (lastT !== undefined && now > lastT) integral += assets * (now - lastT);

  const [stats, feeBps] = await Promise.all([
    c.readContract({ address: pool, abi: poolReads, functionName: "stats", blockNumber }),
    c.readContract({ address: pool, abi: poolReads, functionName: "feeBps", blockNumber }),
  ]);
  const reconciled = stats[0] === assets && stats[3] === fees;
  const windowSeconds = since === undefined ? 0 : Number(now - since);
  // APR in bps = fees × YEAR / Σ(assets × dt) × 1e4
  const aprBps = integral > 0n ? Number((fees * YEAR * 10_000n) / integral) : null;
  return {
    pool,
    /** Realized, annualized from the pool's own history; past fees, not a promise. */
    aprBps: reconciled ? aprBps : null,
    apr: reconciled && aprBps !== null ? aprBps / 10_000 : null,
    /** fees ÷ time-weighted assets over the window, NOT annualized (what lenders actually earned so far). */
    periodReturnPct: integral > 0n && windowSeconds > 0 ? Number((fees * BigInt(windowSeconds) * 1_000_000n) / integral) / 10_000 : null,
    feesRealized: fees.toString(),
    avgAssets: windowSeconds > 0 ? (integral / BigInt(windowSeconds)).toString() : "0",
    totalAssets: stats[0].toString(),
    since: since === undefined ? null : Number(since),
    windowSeconds,
    feeBpsPerAdvance: Number(feeBps),
    reconciled,
  };
}

async function stocksPrice(blockNumber: bigint, now: bigint) {
  const eq = serverAddresses().collaterals.find((x) => x.symbol === "mIDX");
  if (!eq?.feed) return null;
  const c = publicClient();
  const feed = eq.feed as Address;
  const [px8, at, valid] = await c.readContract({ address: feed, abi: feedAbi, functionName: "peek", blockNumber });
  const from = BigInt(serverAddresses().startBlock);
  const updates: { px8: bigint; at: bigint }[] = [];
  for (let f = from; f <= blockNumber; f += CHUNK) {
    const to = f + CHUNK - 1n < blockNumber ? f + CHUNK - 1n : blockNumber;
    for (const l of await c.getLogs({ address: feed, event: priceUpdated, fromBlock: f, toBlock: to }))
      updates.push({ px8: l.args.px8!, at: l.args.updatedAt! });
  }
  const dayAgo = now - 86_400n;
  // the price in force 24h ago = the last update at or before then; none means the feed is younger than a day
  const base = updates.filter((u) => u.at <= dayAgo).at(-1);
  const first = updates[0];
  const pct = (b: bigint) => Number(((px8 - b) * 1_000_000n) / b) / 10_000;
  return {
    token: eq.token,
    symbol: eq.symbol,
    label: eq.label,
    px8: px8.toString(),
    price: Number(px8) / 1e8,
    updatedAt: Number(at),
    valid,
    change24hPct: base ? pct(base.px8) : null,
    /** When the feed is younger than 24h: change since its first price, and when that was. */
    changeSinceFirstPct: !base && first ? pct(first.px8) : null,
    firstPriceAt: first ? Number(first.at) : null,
  };
}
