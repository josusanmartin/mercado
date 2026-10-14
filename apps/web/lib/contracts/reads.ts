"use client";
// Typed read hooks for every view in INTERFACES.md. Views that revert on a stale oracle are read with
// allowFailure, so the UI gets `undefined` plus `oracle.valid === false` instead of an exception.
import type { Address } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { ADDR, CHAIN_ID } from "./addresses";
import { creditPoolAbi, oracleAbi, swapDeskAbi, tokenAbi, vaultAbi } from "./abis";

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

export function useVaultPosition(user?: Address) {
  const who = useWho(user);
  const c = (functionName: "collateralRatio" | "maxMintable" | "maxWithdrawable" | "isLiquidatable") =>
    ({ address: ADDR.vault, abi: vaultAbi, functionName, args: [who!], chainId: CHAIN_ID }) as const;
  const q = useReadContracts({
    contracts: [
      { address: ADDR.vault, abi: vaultAbi, functionName: "getPosition", args: [who!], chainId: CHAIN_ID },
      c("collateralRatio"),
      c("maxMintable"),
      c("maxWithdrawable"),
      c("isLiquidatable"),
    ],
    query: { enabled: !!who, ...REFRESH },
  });
  const pos = ok<{ collateral: bigint; debt: bigint }>(q.data?.[0]);
  const ratio = ok<bigint>(q.data?.[1]);
  return {
    ...q,
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

/** Vault collateral locked, desk inventory, pool cash vs loans out: separate sources of funds. */
export function useThreeBuckets() {
  const q = useReadContracts({
    contracts: [
      { address: ADDR.vault, abi: vaultAbi, functionName: "totalCollateral", chainId: CHAIN_ID },
      { address: ADDR.vault, abi: vaultAbi, functionName: "totalDebt", chainId: CHAIN_ID },
      { address: ADDR.swapDesk, abi: swapDeskAbi, functionName: "reserves", chainId: CHAIN_ID },
      { address: ADDR.creditPool, abi: creditPoolAbi, functionName: "stats", chainId: CHAIN_ID },
      { address: ADDR.creditPool, abi: creditPoolAbi, functionName: "availableLiquidity", chainId: CHAIN_ID },
      { address: ADDR.xmxn, abi: tokenAbi, functionName: "totalSupply", chainId: CHAIN_ID },
    ],
    query: REFRESH,
  });
  const reserves = ok<readonly [bigint, bigint]>(q.data?.[2]);
  const stats = ok<readonly [bigint, bigint, bigint, bigint]>(q.data?.[3]);
  return {
    ...q,
    vault: { collateralOusd: ok<bigint>(q.data?.[0]), debtXmxn: ok<bigint>(q.data?.[1]) },
    desk: { ousd: reserves?.[0], xmxn: reserves?.[1] },
    pool: { cash: ok<bigint>(q.data?.[4]), loansOut: stats?.[2], lenderClaims: stats?.[0], realizedFees: stats?.[3] },
    xmxnSupply: ok<bigint>(q.data?.[5]),
  };
}
