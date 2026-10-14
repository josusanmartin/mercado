"use client";
// On-chain activity indexer (getLogs) for the product pages. Protocol-aware via activeAddresses(): it only ever
// reads the ACTIVE protocol's contracts. Nothing here is a fixture: every row is a real log with its tx hash.
//
//   const feed = useActivityFeed("move", { account, limit: 20 });   // rows, newest first
//   const t = useFlowTotals();                                        // all-time sums (bigint, 6dp)
// Labels: "Minted xMXN", "OUSD → xMXN", "Advance drawn", "Transfer to merchant" (merchant inflows, R-038).
//
// Kinds:
//   mint   CREATE vault: Deposited / Minted / Repaid / Withdrawn / Liquidated
//   move   v2 MoveAMM Swapped (OUSD→xMXN mints to `to`, xMXN→OUSD redeems) · v1 SwapDesk Swapped
//   credit CreditPool: Supplied / Withdrawn (lenders) · Borrowed / Repaid (drivers)
//   mpp    xMXN Transfer → merchant wallet: MERCHANT INFLOWS. MPP payments settle here, but a transfer alone is
//          not proof of a verified MPP order (review R-038); verified orders live in the bills API.
//   card   v2 MercadoCard: CardIssued / CardCharged (holder → merchant) / CardRefunded / CardFrozen
//   invest v2 savings + desks: sOUSD / sxMXN Deposit & Withdraw (ERC-4626), InvestDesk Bought / Sold (T-bill + Stocks)
// Logs are scanned from the protocol's deployment block and cached incrementally in memory.
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { getAddress, parseAbi, type Address, type Hash, type Log, type PublicClient } from "viem";
import { activeAddresses, explorerTx } from "@mercado/shared";

export type ActivityKind = "mint" | "move" | "credit" | "mpp" | "card" | "invest";

export type ActivityRow = {
  kind: ActivityKind;
  /** Event name, e.g. "Minted", "Swapped", "Borrowed", "Transfer". */
  event: string;
  /** Short human label, e.g. "Minted xMXN", "OUSD → xMXN", "Advance drawn", "Transfer to merchant". */
  label: string;
  /** Main amount (6dp base units) and its token symbol. */
  amount: bigint;
  token: string;
  /** Second leg for swaps (what came out). */
  amountOut?: bigint;
  tokenOut?: string;
  /** The account the row is about (minter, swapper, borrower/lender, payer). */
  account: Address;
  from?: Address;
  to?: Address;
  /** Collateral symbol for vault rows (v2: per collateral); for invest rows the product: usd | mxn | stocks | tbill */
  collateral?: string;
  fee?: bigint;
  /** card rows */
  cardId?: bigint;
  chargeId?: bigint;
  merchantRef?: Hash;
  txHash: Hash;
  url: string;
  blockNumber: bigint;
  logIndex: number;
  /** Unix seconds (from the log's blockTimestamp). */
  timestamp?: number;
};

const A = activeAddresses();
const V2 = A.protocol === "v2";
const sym = (token?: string) => A.collaterals.find((c) => c.token.toLowerCase() === token?.toLowerCase())?.symbol ?? "OUSD";

const VAULT_V1 = parseAbi([
  "event Deposited(address indexed user, uint256 amount)",
  "event Minted(address indexed user, uint256 amount)",
  "event Repaid(address indexed user, uint256 amount)",
  "event Withdrawn(address indexed user, uint256 amount)",
  "event Liquidated(address indexed user, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized)",
]);
const VAULT_V2 = parseAbi([
  "event Deposited(address indexed user, address indexed token, uint256 amount)",
  "event Minted(address indexed user, address indexed token, uint256 amount)",
  "event Repaid(address indexed user, address indexed token, uint256 amount)",
  "event Withdrawn(address indexed user, address indexed token, uint256 amount)",
  "event Liquidated(address indexed user, address indexed token, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized)",
]);
const AMM = parseAbi([
  "event Swapped(address indexed user, address indexed to, bool usdToMxn, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 impactBps, uint256 mid)",
]);
const DESK = parseAbi(["event Swapped(address indexed user, bool ousdToXmxn, uint256 amountIn, uint256 amountOut, uint256 fee)"]);
const POOL = parseAbi([
  "event Supplied(address indexed lender, uint256 amount)",
  "event Withdrawn(address indexed lender, uint256 amount)",
  "event Borrowed(address indexed borrower, uint256 amount, uint256 fee, uint256 nonce, bytes32 dataHash)",
  "event Repaid(address indexed borrower, uint256 amount, uint256 remainingDebt)",
]);
const TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 amount)"]);
const CARD = parseAbi([
  "event CardIssued(uint256 indexed cardId, address indexed holder, uint256 dailyLimit)",
  "event CardCharged(uint256 indexed chargeId, uint256 indexed cardId, address indexed merchant, address holder, uint256 amount, bytes32 merchantRef)",
  "event CardRefunded(uint256 indexed chargeId, uint256 indexed cardId, address indexed merchant, address holder, uint256 amount)",
  "event CardFrozen(uint256 indexed cardId, bool frozen)",
]);
const NO_CARD = !A.card || /^0x0{40}$/.test(A.card);
const VAULT4626 = parseAbi([
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
]);
const DESK_EVENTS = parseAbi([
  "event Bought(address indexed user, bool withXmxn, uint256 payIn, uint256 ousdUsed, uint256 tbillOut, uint256 fee, uint256 px)",
  "event Sold(address indexed user, bool forXmxn, uint256 tbillIn, uint256 ousdOut, uint256 received, uint256 fee, uint256 px)",
]);
const SOUSD_ADDR = A.collaterals.find((c) => c.symbol === "sOUSD")?.token;
const INVEST_ADDRS = [SOUSD_ADDR, A.sxMXN, A.investDesk, A.investDeskIdx].filter(
  (a): a is Address => !!a && !/^0x0{40}$/.test(a),
);
const investWhat = (addr?: string) => {
  const a = addr?.toLowerCase();
  if (a && a === SOUSD_ADDR?.toLowerCase()) return { product: "usd", token: "OUSD", share: "sOUSD" };
  if (a && a === A.sxMXN?.toLowerCase()) return { product: "mxn", token: "xMXN", share: "sxMXN" };
  if (a && a === A.investDeskIdx?.toLowerCase()) return { product: "stocks", token: "mIDX", share: "mIDX" };
  return { product: "tbill", token: "tTBILL", share: "tTBILL" };
};

type AnyLog = Log & { eventName: string; args: Record<string, unknown>; blockTimestamp?: string | bigint | number };

function source(kind: ActivityKind) {
  switch (kind) {
    case "mint":
      return { address: A.vault, events: V2 ? VAULT_V2 : VAULT_V1 };
    case "move":
      return V2 ? { address: A.vamm!, events: AMM } : { address: A.swapDesk!, events: DESK };
    case "credit":
      return { address: A.creditPool, events: POOL };
    case "card":
      return { address: A.card!, events: CARD };
    case "invest":
      return { address: INVEST_ADDRS, events: [...VAULT4626, ...DESK_EVENTS] };
    case "mpp":
      // single event + indexed arg → filtered by topic on the node, not client-side
      return { address: A.xMXN, event: TRANSFER[0], args: { to: A.merchant } };
  }
}

function toRow(kind: ActivityKind, l: AnyLog): ActivityRow {
  const a = l.args as Record<string, never>;
  const base = {
    kind,
    event: l.eventName,
    txHash: l.transactionHash!,
    url: explorerTx(l.transactionHash!),
    blockNumber: l.blockNumber!,
    logIndex: l.logIndex ?? 0,
    timestamp: l.blockTimestamp !== undefined ? Number(BigInt(l.blockTimestamp)) : undefined,
  };
  if (kind === "mint") {
    const user = a.user as Address;
    const collateral = V2 ? sym(a.token) : "OUSD";
    switch (l.eventName) {
      case "Deposited":
        return { ...base, label: `Deposited ${collateral}`, amount: a.amount, token: collateral, account: user, collateral };
      case "Withdrawn":
        return { ...base, label: `Withdrew ${collateral}`, amount: a.amount, token: collateral, account: user, collateral };
      case "Minted":
        return { ...base, label: "Minted xMXN", amount: a.amount, token: "xMXN", account: user, collateral };
      case "Repaid":
        return { ...base, label: "Repaid and burned xMXN", amount: a.amount, token: "xMXN", account: user, collateral };
      default:
        return {
          ...base,
          label: `Liquidated (${collateral})`,
          amount: a.debtCovered,
          token: "xMXN",
          amountOut: a.collateralSeized,
          tokenOut: collateral,
          account: user,
          from: a.liquidator,
          collateral,
        };
    }
  }
  if (kind === "move") {
    const usdToMxn = (V2 ? a.usdToMxn : a.ousdToXmxn) as boolean;
    return {
      ...base,
      label: usdToMxn ? "OUSD → xMXN" : "xMXN → OUSD",
      amount: a.amountIn,
      token: usdToMxn ? "OUSD" : "xMXN",
      amountOut: a.amountOut,
      tokenOut: usdToMxn ? "xMXN" : "OUSD",
      account: a.user,
      to: V2 ? a.to : a.user,
      fee: a.fee,
    };
  }
  if (kind === "credit") {
    const who = (a.lender ?? a.borrower) as Address;
    const label =
      l.eventName === "Supplied" ? "Lender supplied" : l.eventName === "Withdrawn" ? "Lender withdrew" : l.eventName === "Borrowed" ? "Advance drawn" : "Advance repaid";
    return { ...base, label, amount: a.amount, token: "xMXN", account: who, fee: l.eventName === "Borrowed" ? a.fee : undefined };
  }
  if (kind === "invest") {
    const w = investWhat(l.address);
    switch (l.eventName) {
      case "Deposit":
        return { ...base, label: `Saved in ${w.share}`, amount: a.assets, token: w.token, amountOut: a.shares, tokenOut: w.share, account: a.owner, collateral: w.product };
      case "Withdraw":
        return { ...base, label: `Withdrew from ${w.share}`, amount: a.assets, token: w.token, amountOut: a.shares, tokenOut: w.share, account: a.owner, collateral: w.product };
      case "Bought":
        return {
          ...base,
          label: `Bought ${w.token}`,
          amount: a.payIn,
          token: a.withXmxn ? "xMXN" : "OUSD",
          amountOut: a.tbillOut,
          tokenOut: w.token,
          account: a.user,
          fee: a.fee,
          collateral: w.product,
        };
      default:
        return {
          ...base,
          label: `Sold ${w.token}`,
          amount: a.tbillIn,
          token: w.token,
          amountOut: a.received,
          tokenOut: a.forXmxn ? "xMXN" : "OUSD",
          account: a.user,
          fee: a.fee,
          collateral: w.product,
        };
    }
  }
  if (kind === "card") {
    switch (l.eventName) {
      case "CardIssued":
        return { ...base, label: "Card issued", amount: a.dailyLimit, token: "xMXN/day", account: a.holder, cardId: a.cardId };
      case "CardCharged":
        return { ...base, label: "Card payment", amount: a.amount, token: "xMXN", account: a.holder, from: a.holder, to: a.merchant, cardId: a.cardId, chargeId: a.chargeId, merchantRef: a.merchantRef };
      case "CardRefunded":
        return { ...base, label: "Card refund", amount: a.amount, token: "xMXN", account: a.holder, from: a.merchant, to: a.holder, cardId: a.cardId, chargeId: a.chargeId };
      default:
        return { ...base, label: a.frozen ? "Card frozen" : "Card unfrozen", amount: 0n, token: "", account: "0x0000000000000000000000000000000000000000", cardId: a.cardId };
    }
  }
  return { ...base, label: "Transfer to merchant", amount: a.amount, token: "xMXN", account: a.from, from: a.from, to: a.to };
}

// ---------------------------------------------------------------- incremental cache (per kind, this tab)

type Cache = { rows: ActivityRow[]; toBlock: bigint };
const cache = new Map<string, Cache>();
const inflight = new Map<string, Promise<ActivityRow[]>>();
const CHUNK = 20_000n;

// RPC hygiene (lead 03:44: zero red 429s in devtools): every getLogs in this tab goes through ONE serial queue,
// and rate-limit / "exceeds defined limit" errors back off exponentially (250ms → 4s, 6 tries) instead of failing.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}
const isRateLimit = (e: unknown) => /429|rate limit|exceeds defined limit|too many requests/i.test(String((e as Error)?.message ?? e));
async function getLogsWithBackoff(client: PublicClient, args: Record<string, unknown>): Promise<AnyLog[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await serial(() => client.getLogs(args as never))) as unknown as AnyLog[];
    } catch (e) {
      if (!isRateLimit(e) || attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    }
  }
}

// One head lookup per refresh, shared by every kind (useFlowTotals asks for five at once).
let head: { at: number; p: Promise<bigint> } | undefined;
function latestBlock(client: PublicClient): Promise<bigint> {
  if (!head || Date.now() - head.at > 2_000) {
    const p = client.getBlockNumber({ cacheTime: 2_000 });
    head = { at: Date.now(), p };
    p.catch(() => (head?.p === p ? (head = undefined) : undefined));
  }
  return head.p;
}

/** All rows of a kind for the active protocol, newest first. Usable outside React (pass any viem client). */
export async function fetchActivity(client: PublicClient, kind: ActivityKind): Promise<ActivityRow[]> {
  const key = `${A.protocol}:${kind}`;
  const running = inflight.get(key);
  if (running) return running;
  if (kind === "card" && NO_CARD) return [];
  if (kind === "invest" && INVEST_ADDRS.length === 0) return [];
  const p = (async () => {
    const latest = await latestBlock(client);
    const c = cache.get(key) ?? { rows: [], toBlock: BigInt(A.startBlock) - 1n };
    const s = source(kind);
    const fresh: ActivityRow[] = [];
    for (let from = c.toBlock + 1n; from <= latest; from += CHUNK) {
      const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
      const logs = await getLogsWithBackoff(client, { ...s, fromBlock: from, toBlock: to, strict: true });
      for (const l of logs) fresh.push(toRow(kind, l));
    }
    const rows = [...c.rows, ...fresh].sort((x, y) => (x.blockNumber === y.blockNumber ? y.logIndex - x.logIndex : x.blockNumber > y.blockNumber ? -1 : 1));
    cache.set(key, { rows, toBlock: latest });
    return rows;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ---------------------------------------------------------------- hooks

const REFRESH_MS = 15_000;

/** Newest-first activity of one kind; optionally only rows involving `account` (account/from/to). */
export function useActivityFeed(kind: ActivityKind, opts: { account?: Address; limit?: number } = {}) {
  const client = usePublicClient();
  const account = opts.account ? getAddress(opts.account) : undefined;
  const q = useQuery({
    queryKey: ["mercado-activity", A.protocol, kind],
    queryFn: () => fetchActivity(client as PublicClient, kind),
    enabled: !!client,
    refetchInterval: REFRESH_MS,
  });
  const all = q.data ?? [];
  const mine = account
    ? all.filter((r) => [r.account, r.from, r.to].some((x) => x && getAddress(x) === account))
    : all;
  return { ...q, rows: mine.slice(0, opts.limit ?? 50), total: mine.length };
}

export type FlowTotals = {
  /** xMXN created: CDP mints + (v2) exchange mints */
  minted: bigint;
  /** xMXN destroyed: CDP repays + liquidations + (v2) exchange redemptions */
  burned: bigint;
  /** OUSD paid in for xMXN (Move, USD side) and xMXN paid in for OUSD */
  movedUsdToMxn: bigint;
  movedMxnToUsd: bigint;
  /** xMXN delivered by OUSD→xMXN swaps */
  deliveredMxn: bigint;
  lent: bigint;
  repaid: bigint;
  /** xMXN received by the merchant wallet (where MPP payments settle; not each is a verified order) */
  merchantInflows: bigint;
  /** Mercado Card (v2): xMXN spent at merchants and refunded */
  cardSpent: bigint;
  cardRefunded: bigint;
  counts: Record<Exclude<ActivityKind, "invest">, number>;
};

/** All-time flow sums for the active protocol, from the same logs. */
export function useFlowTotals() {
  const client = usePublicClient();
  const q = useQuery({
    queryKey: ["mercado-flow-totals", A.protocol],
    enabled: !!client,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<FlowTotals> => {
      const c = client as PublicClient;
      const [mint, move, credit, mpp, card] = await Promise.all(
        (["mint", "move", "credit", "mpp", "card"] as const).map((k) => fetchActivity(c, k)),
      );
      const sum = (rows: ActivityRow[], f: (r: ActivityRow) => bigint) => rows.reduce((t, r) => t + f(r), 0n);
      const ammMint = V2 ? sum(move, (r) => (r.token === "OUSD" ? (r.amountOut ?? 0n) : 0n)) : 0n;
      const ammBurn = V2 ? sum(move, (r) => (r.token === "xMXN" ? r.amount : 0n)) : 0n;
      return {
        minted: sum(mint, (r) => (r.event === "Minted" ? r.amount : 0n)) + ammMint,
        burned: sum(mint, (r) => (r.event === "Repaid" || r.event === "Liquidated" ? r.amount : 0n)) + ammBurn,
        movedUsdToMxn: sum(move, (r) => (r.token === "OUSD" ? r.amount : 0n)),
        movedMxnToUsd: sum(move, (r) => (r.token === "xMXN" ? r.amount : 0n)),
        deliveredMxn: sum(move, (r) => (r.token === "OUSD" ? (r.amountOut ?? 0n) : 0n)),
        lent: sum(credit, (r) => (r.event === "Borrowed" ? r.amount : 0n)),
        repaid: sum(credit, (r) => (r.event === "Repaid" ? r.amount : 0n)),
        merchantInflows: sum(mpp, (r) => r.amount),
        cardSpent: sum(card, (r) => (r.event === "CardCharged" ? r.amount : 0n)),
        cardRefunded: sum(card, (r) => (r.event === "CardRefunded" ? r.amount : 0n)),
        counts: { mint: mint.length, move: move.length, credit: credit.length, mpp: mpp.length, card: card.length },
      };
    },
  });
  return q;
}
