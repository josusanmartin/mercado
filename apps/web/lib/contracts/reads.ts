"use client";
// Typed read hooks for every view in INTERFACES.md. Views that revert on a stale oracle are read with
// allowFailure, so the UI gets `undefined` plus `oracle.valid === false` instead of an exception.
import type { Address } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { investDeskAbi, moveAmmAbi, multiCollateralVaultAbi } from "@mercado/shared";
import { ADDR, CHAIN_ID, COLLATERALS, PROTOCOL } from "./addresses";
import { creditPoolAbi, oracleAbi, swapDeskAbi, tokenAbi, vaultAbi } from "./abis";

const V2 = PROTOCOL === "v2";

// 10s keeps the demo live without tripping the public RPC rate limit (reads are multicall-batched).
const REFRESH = { refetchInterval: 10_000 } as const;
const ok = <T>(r: { status: string; result?: unknown } | undefined) =>
  r?.status === "success" ? (r.result as T) : undefined;

/** Connected address unless one is passed explicitly. */
export function useWho(user?: Address) {
  const { address } = useConnection();
  return user ?? address;
}

// ---------------------------------------------------------------- tokens

/** OUSD + xMXN balances (6dp bigints). */
export function useBalances(user?: Address) {
  const who = useWho(user);
  const q = useReadContracts({
    contracts: [
      { address: ADDR.ousd, abi: tokenAbi, functionName: "balanceOf", args: [who!], chainId: CHAIN_ID },
      { address: ADDR.xmxn, abi: tokenAbi, functionName: "balanceOf", args: [who!], chainId: CHAIN_ID },
      { address: ADDR.feeToken, abi: tokenAbi, functionName: "balanceOf", args: [who!], chainId: CHAIN_ID },
    ],
    query: { enabled: !!who, ...REFRESH },
  });
  return {
    ...q,
    ousd: ok<bigint>(q.data?.[0]),
    xmxn: ok<bigint>(q.data?.[1]),
    /** USD fee-token balance (AlphaUSD), what pays for gas on Tempo. */
    feeToken: ok<bigint>(q.data?.[2]),
  };
}

export function useAllowance(token: Address, spender: Address, owner?: Address) {
  const who = useWho(owner);
  return useReadContract({
    address: token,
    abi: tokenAbi,
    functionName: "allowance",
    args: [who!, spender],
    chainId: CHAIN_ID,
    query: { enabled: !!who, ...REFRESH },
  });
}

// ---------------------------------------------------------------- oracle (MOCK admin feed)

/** FX feed state; never throws. `rate` is a JS number for display only (use mxnPerUsd for math). */
export function useOracle() {
  const q = useReadContracts({
    contracts: [
      { address: ADDR.oracle, abi: oracleAbi, functionName: "peek", chainId: CHAIN_ID },
      { address: ADDR.oracle, abi: oracleAbi, functionName: "maxAge", chainId: CHAIN_ID },
      { address: ADDR.oracle, abi: oracleAbi, functionName: "paused", chainId: CHAIN_ID },
    ],
    query: REFRESH,
  });
  const peek = ok<readonly [bigint, bigint, boolean]>(q.data?.[0]);
  const maxAge = ok<bigint>(q.data?.[1]);
  return {
    ...q,
    mxnPerUsd: peek?.[0],
    rate: peek ? Number(peek[0]) / 1e8 : undefined,
    updatedAt: peek ? Number(peek[1]) : undefined,
    valid: peek?.[2],
    maxAge: maxAge !== undefined ? Number(maxAge) : undefined,
    paused: ok<boolean>(q.data?.[2]),
    /** Always true on testnet: an admin-relayed rate (see /api/fx for provenance), not a decentralized oracle. */
    isMock: true as const,
  };
}

// ---------------------------------------------------------------- vault

/** A user's vault position. v1: the single OUSD position. v2: the position on `token` (default OUSD) in the
 *  MultiCollateralVault (per-collateral API). Same return shape either way. */
export function useVaultPosition(user?: Address, token: Address = ADDR.ousd) {
  const who = useWho(user);
  const v1 = (functionName: "collateralRatio" | "maxMintable" | "maxWithdrawable" | "isLiquidatable") =>
    ({ address: ADDR.vault, abi: vaultAbi, functionName, args: [who!], chainId: CHAIN_ID }) as const;
  const v2 = (functionName: "getPosition" | "collateralRatio" | "maxMintable" | "maxWithdrawable" | "isLiquidatable") =>
    ({ address: ADDR.vault, abi: multiCollateralVaultAbi, functionName, args: [who!, token], chainId: CHAIN_ID }) as const;
  const q = useReadContracts({
    contracts: V2
      ? [v2("getPosition"), v2("collateralRatio"), v2("maxMintable"), v2("maxWithdrawable"), v2("isLiquidatable")]
      : [
          { address: ADDR.vault, abi: vaultAbi, functionName: "getPosition", args: [who!], chainId: CHAIN_ID },
          v1("collateralRatio"),
          v1("maxMintable"),
          v1("maxWithdrawable"),
          v1("isLiquidatable"),
        ],
    query: { enabled: !!who, ...REFRESH },
  });
  const raw = ok<{ collateral: bigint; debt: bigint } | readonly [bigint, bigint]>(q.data?.[0]);
  // v1 returns a struct, v2 a (collateral, debt) tuple
  let pos: { collateral: bigint; debt: bigint } | undefined;
  if (raw !== undefined) {
    const t = raw as readonly [bigint, bigint] & { collateral?: bigint; debt?: bigint };
    pos = t.collateral !== undefined ? { collateral: t.collateral, debt: t.debt as bigint } : { collateral: t[0], debt: t[1] };
  }
  const ratio = ok<bigint>(q.data?.[1]);
  return {
    ...q,
    token,
    collateral: pos?.collateral,
    debt: pos?.debt,
    /** bps; undefined if the oracle is invalid; `null` if there's no debt (infinite ratio). */
    ratioBps: ratio === undefined ? undefined : ratio === 2n ** 256n - 1n ? null : ratio,
    maxMintable: ok<bigint>(q.data?.[2]),
    maxWithdrawable: ok<bigint>(q.data?.[3]),
    isLiquidatable: ok<boolean>(q.data?.[4]),
  };
}

// ---------------------------------------------------------------- swap desk

export function useDesk(user?: Address) {
  const who = useWho(user);
  const d = (functionName: "reserves" | "paused" | "spreadBps" | "maxSwapXmxn" | "dailyCapOusd") =>
    ({ address: ADDR.swapDesk, abi: swapDeskAbi, functionName, chainId: CHAIN_ID }) as const;
  const q = useReadContracts({
    contracts: [
      d("reserves"),
      d("paused"),
      d("spreadBps"),
      d("maxSwapXmxn"),
      d("dailyCapOusd"),
      {
        address: ADDR.swapDesk,
        abi: swapDeskAbi,
        functionName: "remainingDailyCap",
        args: [who ?? "0x0000000000000000000000000000000000000000"],
        chainId: CHAIN_ID,
      },
    ],
    query: REFRESH,
  });
  const reserves = ok<readonly [bigint, bigint]>(q.data?.[0]);
  return {
    ...q,
    reserveOusd: reserves?.[0],
    reserveXmxn: reserves?.[1],
    paused: ok<boolean>(q.data?.[1]),
    spreadBps: ok<bigint>(q.data?.[2]),
    maxSwapXmxn: ok<bigint>(q.data?.[3]),
    dailyCapOusd: ok<bigint>(q.data?.[4]),
    remainingDailyCap: who ? ok<bigint>(q.data?.[5]) : undefined,
  };
}

/** Live quote. `error` is set (e.g. InsufficientReserves, StalePrice) when the desk would revert. */
export function useSwapQuote(ousdToXmxn: boolean, amountIn: bigint | undefined) {
  const q = useReadContract({
    address: ADDR.swapDesk,
    abi: swapDeskAbi,
    functionName: "quote",
    args: [ousdToXmxn, amountIn ?? 0n],
    chainId: CHAIN_ID,
    query: { enabled: !!amountIn && amountIn > 0n, retry: false, ...REFRESH },
  });
  return { ...q, amountOut: q.data?.[0], fee: q.data?.[1] };
}

// ---------------------------------------------------------------- credit pool

export function usePool(user?: Address) {
  const who = useWho(user);
  const enabledUser = !!who;
  const u = <F extends "lenderBalance" | "getDebt" | "maxBorrowable" | "loans">(functionName: F) =>
    ({
      address: ADDR.creditPool,
      abi: creditPoolAbi,
      functionName,
      args: [who ?? "0x0000000000000000000000000000000000000000"],
      chainId: CHAIN_ID,
    }) as const;
  const q = useReadContracts({
    contracts: [
      { address: ADDR.creditPool, abi: creditPoolAbi, functionName: "stats", chainId: CHAIN_ID },
      { address: ADDR.creditPool, abi: creditPoolAbi, functionName: "availableLiquidity", chainId: CHAIN_ID },
      u("lenderBalance"),
      u("getDebt"),
      u("maxBorrowable"),
      u("loans"),
      { address: ADDR.creditPool, abi: creditPoolAbi, functionName: "feeBps", chainId: CHAIN_ID },
      { address: ADDR.creditPool, abi: creditPoolAbi, functionName: "perUserCap", chainId: CHAIN_ID },
      { address: ADDR.creditPool, abi: creditPoolAbi, functionName: "maxUtilizationBps", chainId: CHAIN_ID },
    ],
    query: REFRESH,
  });
  const stats = ok<readonly [bigint, bigint, bigint, bigint]>(q.data?.[0]);
  const loan = ok<readonly [bigint, bigint]>(q.data?.[5]);
  return {
    ...q,
    /** Lender claims = idle cash + lent principal (label "lender claims", not "supplied"). */
    totalAssets: stats?.[0],
    totalBorrowed: stats?.[1],
    outstanding: stats?.[2],
    realizedFees: stats?.[3],
    available: ok<bigint>(q.data?.[1]),
    lenderBalance: enabledUser ? ok<bigint>(q.data?.[2]) : undefined,
    debt: enabledUser ? ok<bigint>(q.data?.[3]) : undefined,
    maxBorrowable: enabledUser ? ok<bigint>(q.data?.[4]) : undefined,
    loanPrincipal: enabledUser ? loan?.[0] : undefined,
    loanFee: enabledUser ? loan?.[1] : undefined,
    /** Live pool params (owner-settable on-chain; never hardcode them in the UI). */
    feeBps: ok<bigint>(q.data?.[6]),
    perUserCap: ok<bigint>(q.data?.[7]),
    maxUtilizationBps: ok<bigint>(q.data?.[8]),
  };
}

/** Executable draw for a given attestation (min of credit line, caps, cash, utilization). */
export function useBorrowCapacity(maxAmount: bigint | undefined, user?: Address) {
  const who = useWho(user);
  return useReadContract({
    address: ADDR.creditPool,
    abi: creditPoolAbi,
    functionName: "borrowCapacity",
    args: [who!, maxAmount ?? 0n],
    chainId: CHAIN_ID,
    query: { enabled: !!who && maxAmount !== undefined, ...REFRESH },
  });
}

// ---------------------------------------------------------------- three buckets (Home / Earn)

/** Vault collateral locked, the exchange's own funds, pool cash vs loans out: separate sources of funds.
 *  v1: `desk` = SwapDesk inventory. v2: `move` = MoveAMM reserve/liability/coverage (desk is undefined), and the
 *  vault side sums every collateral (debt in xMXN, collateral valued in xMXN at current prices). */
export function useThreeBuckets() {
  const n = COLLATERALS.length;
  const common = [
    { address: ADDR.creditPool, abi: creditPoolAbi, functionName: "stats", chainId: CHAIN_ID },
    { address: ADDR.creditPool, abi: creditPoolAbi, functionName: "availableLiquidity", chainId: CHAIN_ID },
    { address: ADDR.xmxn, abi: tokenAbi, functionName: "totalSupply", chainId: CHAIN_ID },
  ] as const;
  const v1 = [
    { address: ADDR.vault, abi: vaultAbi, functionName: "totalCollateral", chainId: CHAIN_ID },
    { address: ADDR.vault, abi: vaultAbi, functionName: "totalDebt", chainId: CHAIN_ID },
    { address: ADDR.swapDesk, abi: swapDeskAbi, functionName: "reserves", chainId: CHAIN_ID },
  ] as const;
  const v2 = [
    { address: ADDR.vamm, abi: moveAmmAbi, functionName: "state", chainId: CHAIN_ID },
    ...COLLATERALS.map((c) => ({ address: ADDR.vault, abi: multiCollateralVaultAbi, functionName: "totals", args: [c.token], chainId: CHAIN_ID }) as const),
  ];
  const q = useReadContracts({ contracts: [...common, ...(V2 ? v2 : v1)] as never, query: REFRESH });
  const d = q.data as { status: string; result?: unknown }[] | undefined;
  const stats = ok<readonly [bigint, bigint, bigint, bigint]>(d?.[0]);
  const pool = { cash: ok<bigint>(d?.[1]), loansOut: stats?.[2], lenderClaims: stats?.[0], realizedFees: stats?.[3] };
  const xmxnSupply = ok<bigint>(d?.[2]);

  // second pass (v2): value each collateral's total in xMXN at current prices
  const totals = V2 ? COLLATERALS.map((_, i) => ok<readonly [bigint, bigint]>(d?.[4 + i])) : [];
  const values = useReadContracts({
    contracts: COLLATERALS.map((c, i) => ({
      address: ADDR.vault,
      abi: multiCollateralVaultAbi,
      functionName: "collateralValue",
      args: [c.token, totals[i]?.[0] ?? 0n],
      chainId: CHAIN_ID,
    })),
    query: { enabled: V2 && totals.length === n && totals.every((t) => t !== undefined), ...REFRESH },
  });

  if (!V2) {
    const reserves = ok<readonly [bigint, bigint]>(d?.[5]);
    return {
      ...q,
      protocol: "v1" as const,
      vault: { collateralOusd: ok<bigint>(d?.[3]), debtXmxn: ok<bigint>(d?.[4]), collateralValueXmxn: undefined as bigint | undefined },
      desk: { ousd: reserves?.[0], xmxn: reserves?.[1] } as { ousd?: bigint; xmxn?: bigint },
      move: undefined as { reserveOusd?: bigint; liabilityXmxn?: bigint; equityOusd?: bigint; coverageBps?: bigint } | undefined,
      pool,
      xmxnSupply,
    };
  }
  const st = ok<readonly [bigint, bigint, bigint, bigint, bigint, bigint]>(d?.[3]);
  const sum = (xs: (bigint | undefined)[]) => (xs.some((x) => x === undefined) ? undefined : xs.reduce<bigint>((a, b) => a + (b ?? 0n), 0n));
  const ousdIdx = COLLATERALS.findIndex((c) => c.symbol === "OUSD");
  return {
    ...q,
    protocol: "v2" as const,
    vault: {
      /** OUSD collateral only (other collaterals are in their own units; see collateralValueXmxn) */
      collateralOusd: ousdIdx >= 0 ? totals[ousdIdx]?.[0] : undefined,
      debtXmxn: sum(totals.map((t) => t?.[1])),
      collateralValueXmxn: sum((values.data ?? []).map((r) => ok<bigint>(r))),
    },
    /** v2 has no swap desk: always-undefined fields (use `move`) */
    desk: { ousd: undefined, xmxn: undefined } as { ousd?: bigint; xmxn?: bigint },
    move: st && { reserveOusd: st[0], liabilityXmxn: st[1], equityOusd: st[2], coverageBps: st[3] },
    pool,
    xmxnSupply,
  };
}

// ---------------------------------------------------------------- collateral book (Mint dashboard)

export type CollateralBookRow = {
  symbol: string;
  token: Address;
  label: string;
  demo: boolean;
  decimals?: number;
  /** USD per unit, 8dp (v1 OUSD: assumed 1.00) */
  usdPx8?: bigint;
  collateral?: bigint;
  debt?: bigint;
  /** collateral value in xMXN (6dp) at current prices */
  valueXmxn?: bigint;
  mintRatioBps?: number;
  liqRatioBps?: number;
  penaltyBps?: number;
  /** undefined = no ceiling (v1) */
  debtCeiling?: bigint;
  mintPaused?: boolean;
};

const priceAbi = [
  { type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }, { type: "uint256" }] },
] as const;
const decimalsAbi = [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }] as const;

/** Every collateral of the active protocol with totals, risk params, prices and xMXN value. All live reads. */
export function useCollateralBook() {
  const fx = useOracle();
  const v1 = useReadContracts({
    contracts: [
      { address: ADDR.vault, abi: vaultAbi, functionName: "totalCollateral", chainId: CHAIN_ID },
      { address: ADDR.vault, abi: vaultAbi, functionName: "totalDebt", chainId: CHAIN_ID },
      { address: ADDR.vault, abi: vaultAbi, functionName: "MIN_MINT_RATIO_BPS", chainId: CHAIN_ID },
      { address: ADDR.vault, abi: vaultAbi, functionName: "LIQUIDATION_THRESHOLD_BPS", chainId: CHAIN_ID },
      { address: ADDR.vault, abi: vaultAbi, functionName: "LIQUIDATION_PENALTY_BPS", chainId: CHAIN_ID },
    ],
    query: { enabled: !V2, ...REFRESH },
  });
  const v2 = useReadContracts({
    contracts: COLLATERALS.flatMap((c) => [
      { address: ADDR.vault, abi: multiCollateralVaultAbi, functionName: "params", args: [c.token], chainId: CHAIN_ID },
      { address: ADDR.vault, abi: multiCollateralVaultAbi, functionName: "totals", args: [c.token], chainId: CHAIN_ID },
      { address: c.token, abi: decimalsAbi, functionName: "decimals", chainId: CHAIN_ID },
      ...(c.feed ? [{ address: c.feed, abi: priceAbi, functionName: "price", chainId: CHAIN_ID }] : []),
    ]) as never,
    query: { enabled: V2, ...REFRESH },
  });
  const fxPx = fx.mxnPerUsd;
  const value = (coll?: bigint, usdPx8?: bigint, dec = 6) =>
    coll === undefined || usdPx8 === undefined || fxPx === undefined
      ? undefined
      : (((coll * usdPx8 * 1_000_000n) / (10n ** BigInt(dec) * 100_000_000n)) * fxPx) / 100_000_000n;

  let rows: CollateralBookRow[];
  if (!V2) {
    const d = v1.data;
    const c = COLLATERALS[0];
    const coll = ok<bigint>(d?.[0]);
    rows = [
      {
        ...c,
        decimals: 6,
        usdPx8: 100_000_000n, // v1 values OUSD at $1.00 (an assumption, labeled on the page)
        collateral: coll,
        debt: ok<bigint>(d?.[1]),
        valueXmxn: value(coll, 100_000_000n),
        mintRatioBps: d ? Number(ok<bigint>(d[2]) ?? 0) || undefined : undefined,
        liqRatioBps: d ? Number(ok<bigint>(d[3]) ?? 0) || undefined : undefined,
        penaltyBps: d ? Number(ok<bigint>(d[4]) ?? 0) || undefined : undefined,
        debtCeiling: undefined,
        mintPaused: false,
      },
    ];
  } else {
    const d = (v2.data ?? []) as { status: string; result?: unknown }[];
    let i = 0;
    rows = COLLATERALS.map((c) => {
      const p = ok<{ mintRatioBps: number; liqRatioBps: number; liqPenaltyBps: number; debtCeiling: bigint; mintPaused: boolean }>(d[i++]);
      const t = ok<readonly [bigint, bigint]>(d[i++]);
      const dec = ok<number>(d[i++]);
      const px = c.feed ? ok<readonly [bigint, bigint]>(d[i++]) : undefined;
      return {
        ...c,
        decimals: dec,
        usdPx8: px?.[0],
        collateral: t?.[0],
        debt: t?.[1],
        valueXmxn: value(t?.[0], px?.[0], dec ?? 6),
        mintRatioBps: p?.mintRatioBps,
        liqRatioBps: p?.liqRatioBps,
        penaltyBps: p?.liqPenaltyBps,
        debtCeiling: p?.debtCeiling,
        mintPaused: p?.mintPaused,
      };
    });
  }
  const all = <K extends keyof CollateralBookRow>(k: K) =>
    rows.some((r) => r[k] === undefined) ? undefined : rows.reduce((s, r) => s + ((r[k] as bigint | undefined) ?? 0n), 0n);
  return {
    protocol: PROTOCOL,
    rows,
    totalValueXmxn: all("valueXmxn"),
    totalDebt: all("debt"),
    isLoading: (V2 ? v2.isLoading : v1.isLoading) || fx.isLoading,
    error: V2 ? v2.error : v1.error,
  };
}

/** The connected user's position on every collateral of the active protocol. */
export function useMyPositions(user?: Address) {
  const who = useWho(user);
  const q = useReadContracts({
    contracts: V2
      ? COLLATERALS.flatMap((c) =>
          (["getPosition", "collateralRatio", "maxMintable", "maxWithdrawable", "isLiquidatable"] as const).map(
            (functionName) => ({ address: ADDR.vault, abi: multiCollateralVaultAbi, functionName, args: [who!, c.token], chainId: CHAIN_ID }) as const,
          ),
        )
      : (["getPosition", "collateralRatio", "maxMintable", "maxWithdrawable", "isLiquidatable"] as const).map(
          (functionName) => ({ address: ADDR.vault, abi: vaultAbi, functionName, args: [who!], chainId: CHAIN_ID }) as const,
        ),
    query: { enabled: !!who, ...REFRESH },
  } as never);
  const d = (q.data ?? []) as { status: string; result?: unknown }[];
  const positions = COLLATERALS.map((c, i) => {
    const o = i * 5;
    const raw = ok<readonly [bigint, bigint] & { collateral?: bigint; debt?: bigint }>(d[o]);
    const coll = raw === undefined ? undefined : raw.collateral ?? raw[0];
    const debt = raw === undefined ? undefined : raw.debt ?? raw[1];
    const ratio = ok<bigint>(d[o + 1]);
    return {
      ...c,
      collateral: coll,
      debt,
      ratioBps: ratio === undefined ? undefined : ratio === 2n ** 256n - 1n ? null : ratio,
      maxMintable: ok<bigint>(d[o + 2]),
      maxWithdrawable: ok<bigint>(d[o + 3]),
      isLiquidatable: ok<boolean>(d[o + 4]),
    };
  });
  return { ...q, positions, open: positions.filter((p) => (p.collateral ?? 0n) > 0n || (p.debt ?? 0n) > 0n) };
}

// ---------------------------------------------------------------- exchange state (Global backing panel)

/** The active protocol's exchange: v2 MoveAMM balance sheet + redemption bucket, or v1 swap desk inventory. */
export function useExchangeState() {
  const { address } = useConnection();
  const q = useReadContracts({
    contracts: V2
      ? [
          { address: ADDR.vamm, abi: moveAmmAbi, functionName: "state", chainId: CHAIN_ID },
          { address: ADDR.vamm, abi: moveAmmAbi, functionName: "feeBps", chainId: CHAIN_ID },
          { address: ADDR.vamm, abi: moveAmmAbi, functionName: "depthUsd", chainId: CHAIN_ID },
          { address: ADDR.vamm, abi: moveAmmAbi, functionName: "maxSwapUsd", chainId: CHAIN_ID },
          { address: ADDR.vamm, abi: moveAmmAbi, functionName: "redeemCapBps", chainId: CHAIN_ID },
          { address: ADDR.vamm, abi: moveAmmAbi, functionName: "paused", chainId: CHAIN_ID },
          { address: ADDR.vamm, abi: moveAmmAbi, functionName: "minMintCoverageBps", chainId: CHAIN_ID },
        ]
      : [
          { address: ADDR.swapDesk, abi: swapDeskAbi, functionName: "reserves", chainId: CHAIN_ID },
          { address: ADDR.swapDesk, abi: swapDeskAbi, functionName: "spreadBps", chainId: CHAIN_ID },
          { address: ADDR.swapDesk, abi: swapDeskAbi, functionName: "maxSwapXmxn", chainId: CHAIN_ID },
          { address: ADDR.swapDesk, abi: swapDeskAbi, functionName: "dailyCapOusd", chainId: CHAIN_ID },
          { address: ADDR.swapDesk, abi: swapDeskAbi, functionName: "paused", chainId: CHAIN_ID },
          {
            address: ADDR.swapDesk,
            abi: swapDeskAbi,
            functionName: "remainingDailyCap",
            args: [address ?? "0x0000000000000000000000000000000000000000"],
            chainId: CHAIN_ID,
          },
        ],
    query: REFRESH,
  } as never);
  const d = (q.data ?? []) as { status: string; result?: unknown }[];
  if (V2) {
    const st = ok<readonly [bigint, bigint, bigint, bigint, bigint, bigint]>(d[0]);
    return {
      ...q,
      protocol: "v2" as const,
      venue: ADDR.vamm,
      reserveOusd: st?.[0],
      liabilityXmxn: st?.[1],
      equityOusd: st?.[2],
      coverageBps: st?.[3],
      bucketUsedOusd: st?.[4],
      bucketCapOusd: st?.[5],
      feeBps: ok<bigint>(d[1]),
      depthUsd: ok<bigint>(d[2]),
      maxSwapUsd: ok<bigint>(d[3]),
      redeemCapBps: ok<bigint>(d[4]),
      paused: ok<boolean>(d[5]),
      minMintCoverageBps: ok<bigint>(d[6]),
    };
  }
  const r = ok<readonly [bigint, bigint]>(d[0]);
  return {
    ...q,
    protocol: "v1" as const,
    venue: ADDR.swapDesk,
    reserveOusd: r?.[0],
    reserveXmxn: r?.[1],
    feeBps: ok<bigint>(d[1]),
    maxSwapXmxn: ok<bigint>(d[2]),
    dailyCapOusd: ok<bigint>(d[3]),
    paused: ok<boolean>(d[4]),
    remainingDailyCap: address ? ok<bigint>(d[5]) : undefined,
  };
}

// ---------------------------------------------------------------- Invest desk (v2)

/** InvestDesk state + the wallet's buy-back eligibility: the desk buys back at most `sellableTbill` (what this
 *  address bought from it and hasn't sold), regardless of the wallet's tTBILL balance (review R-042). */
export function useInvestDesk(user?: Address) {
  const who = useWho(user);
  const enabled = V2 && ADDR.investDesk !== "0x0000000000000000000000000000000000000000";
  const q = useReadContracts({
    contracts: [
      { address: ADDR.investDesk, abi: investDeskAbi, functionName: "reserves", chainId: CHAIN_ID },
      { address: ADDR.investDesk, abi: investDeskAbi, functionName: "spreadBps", chainId: CHAIN_ID },
      { address: ADDR.investDesk, abi: investDeskAbi, functionName: "maxTradeUsd", chainId: CHAIN_ID },
      { address: ADDR.investDesk, abi: investDeskAbi, functionName: "paused", chainId: CHAIN_ID },
      {
        address: ADDR.investDesk,
        abi: investDeskAbi,
        functionName: "bought",
        args: [who ?? "0x0000000000000000000000000000000000000000"],
        chainId: CHAIN_ID,
      },
    ],
    query: { enabled, ...REFRESH },
  });
  const r = ok<readonly [bigint, bigint]>(q.data?.[0]);
  return {
    ...q,
    enabled,
    reserveOusd: r?.[0],
    reserveTbill: r?.[1],
    spreadBps: ok<bigint>(q.data?.[1]),
    maxTradeUsd: ok<bigint>(q.data?.[2]),
    paused: ok<boolean>(q.data?.[3]),
    /** tTBILL this wallet can sell back to the desk (personal, non-transferable buy-back allowance) */
    sellableTbill: who ? ok<bigint>(q.data?.[4]) : undefined,
  };
}
