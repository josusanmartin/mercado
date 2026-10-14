"use client";
// Typed read hooks for every view in INTERFACES.md. Views that revert on a stale oracle are read with
// allowFailure, so the UI gets `undefined` plus `oracle.valid === false` instead of an exception.
import type { Address } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { moveAmmAbi, multiCollateralVaultAbi } from "@mercado/shared";
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
    /** Always true on testnet: label it "mock admin oracle". */
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
