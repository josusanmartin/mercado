"use client";
// On-chain activity indexer (getLogs) for the product pages. Protocol-aware via activeAddresses(): it only ever
// reads the ACTIVE protocol's contracts. Nothing here is a fixture: every row is a real log with its tx hash.
//
//   const feed = useActivityFeed("move", { account, limit: 20 });   // rows, newest first
//   const t = useFlowTotals();                                        // all-time sums (bigint, 6dp)
//
// Kinds:
//   mint   CREATE vault: Deposited / Minted / Repaid / Withdrawn / Liquidated
//   move   v2 MoveAMM Swapped (OUSD→xMXN mints to `to`, xMXN→OUSD redeems) · v1 SwapDesk Swapped
//   credit CreditPool: Supplied / Withdrawn (lenders) · Borrowed / Repaid (drivers)
//   mpp    xMXN Transfer → merchant (MPP 402 bill/API payments)
// Logs are scanned from the protocol's deployment block and cached incrementally in memory.
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { getAddress, parseAbi, type Address, type Hash, type Log, type PublicClient } from "viem";
import { activeAddresses, explorerTx } from "@mercado/shared";

export type ActivityKind = "mint" | "move" | "credit" | "mpp";

export type ActivityRow = {
  kind: ActivityKind;
  /** Event name, e.g. "Minted", "Swapped", "Borrowed", "Transfer". */
  event: string;
  /** Short human label, e.g. "Minted xMXN", "OUSD → xMXN", "Advance drawn", "MPP payment". */
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
  /** Collateral symbol for vault rows (v2: per collateral). */
  collateral?: string;
  fee?: bigint;
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

type AnyLog = Log & { eventName: string; args: Record<string, unknown>; blockTimestamp?: string | bigint | number };

function source(kind: ActivityKind) {
  switch (kind) {
    case "mint":
      return { address: A.vault, events: V2 ? VAULT_V2 : VAULT_V1, args: undefined };
    case "move":
      return V2 ? { address: A.vamm!, events: AMM, args: undefined } : { address: A.swapDesk!, events: DESK, args: undefined };
    case "credit":
      return { address: A.creditPool, events: POOL, args: undefined };
    case "mpp":
      return { address: A.xMXN, events: TRANSFER, args: { to: A.merchant } };
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
  return { ...base, label: "MPP payment", amount: a.amount, token: "xMXN", account: a.from, from: a.from, to: a.to };
}

// ---------------------------------------------------------------- incremental cache (per kind, this tab)

type Cache = { rows: ActivityRow[]; toBlock: bigint };
const cache = new Map<string, Cache>();
const inflight = new Map<string, Promise<ActivityRow[]>>();
const CHUNK = 50_000n;

/** All rows of a kind for the active protocol, newest first. Usable outside React (pass any viem client). */
export async function fetchActivity(client: PublicClient, kind: ActivityKind): Promise<ActivityRow[]> {
  const key = `${A.protocol}:${kind}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const latest = await client.getBlockNumber();
    const c = cache.get(key) ?? { rows: [], toBlock: BigInt(A.startBlock) - 1n };
    const s = source(kind);
    const fresh: ActivityRow[] = [];
    for (let from = c.toBlock + 1n; from <= latest; from += CHUNK) {
      const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
      const logs = (await client.getLogs({
        address: s.address,
        events: s.events,
        args: s.args as never,
        fromBlock: from,
        toBlock: to,
        strict: true,
      } as never)) as unknown as AnyLog[];
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
  mppPaid: bigint;
  counts: Record<ActivityKind, number>;
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
      const [mint, move, credit, mpp] = await Promise.all(
        (["mint", "move", "credit", "mpp"] as const).map((k) => fetchActivity(c, k)),
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
        mppPaid: sum(mpp, (r) => r.amount),
        counts: { mint: mint.length, move: move.length, credit: credit.length, mpp: mpp.length },
      };
    },
  });
  return q;
}
