"use client";
// Read hooks for the v2 Create (MultiCollateralVault) and Move (MoveAMM) modules.
import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { CHAIN_ID, useWho } from "@/lib/contracts";
import { erc20Abi as erc20BalanceAbi } from "viem";
import { erc20MetaAbi, moveAmmAbi, priceFeedAbi, vaultV2Abi } from "./abis";
import { V2 } from "./addresses";

const REFRESH = { refetchInterval: 10_000 } as const;
const ok = <T>(r: { status: string; result?: unknown } | undefined) => (r?.status === "success" ? (r.result as T) : undefined);

export type CollateralParamsV2 = {
  feed: Address;
  mintRatioBps: number;
  liqRatioBps: number;
  liqPenaltyBps: number;
  debtCeiling: bigint;
  mintPaused: boolean;
};

export type CollateralV2 = {
  token: Address;
  symbol?: string;
  name?: string;
  params?: CollateralParamsV2;
  totalCollateral?: bigint;
  totalDebt?: bigint;
  usdPx8?: bigint;
  priceUpdatedAt?: number;
};

/** Every collateral the v2 vault accepts, with its risk params, totals and USD price. */
export function useCollateralsV2() {
  const list = useReadContract({
    address: V2.vault,
    abi: vaultV2Abi,
    functionName: "collaterals",
    chainId: CHAIN_ID,
    query: { enabled: !!V2.vault, ...REFRESH },
  });
  const tokens = (list.data ?? []) as readonly Address[];
  const per = useReadContracts({
    contracts: tokens.flatMap((token) => [
      { address: token, abi: erc20MetaAbi, functionName: "symbol", chainId: CHAIN_ID } as const,
      { address: token, abi: erc20MetaAbi, functionName: "name", chainId: CHAIN_ID } as const,
      { address: V2.vault!, abi: vaultV2Abi, functionName: "params", args: [token], chainId: CHAIN_ID } as const,
      { address: V2.vault!, abi: vaultV2Abi, functionName: "totals", args: [token], chainId: CHAIN_ID } as const,
    ]),
    query: { enabled: tokens.length > 0, ...REFRESH },
  });
  const params = tokens.map((_, i) => ok<CollateralParamsV2>(per.data?.[i * 4 + 2]));
  const feeds = useReadContracts({
    contracts: params.map((p) => ({ address: p?.feed, abi: priceFeedAbi, functionName: "price", chainId: CHAIN_ID }) as const),
    query: { enabled: params.some(Boolean), ...REFRESH },
  });
  const items: CollateralV2[] = tokens.map((token, i) => {
    const totals = ok<readonly [bigint, bigint]>(per.data?.[i * 4 + 3]);
    const px = ok<readonly [bigint, bigint]>(feeds.data?.[i]);
    return {
      token,
      symbol: ok<string>(per.data?.[i * 4]),
      name: ok<string>(per.data?.[i * 4 + 1]),
      params: params[i],
      totalCollateral: totals?.[0],
      totalDebt: totals?.[1],
      usdPx8: px?.[0],
      priceUpdatedAt: px ? Number(px[1]) : undefined,
    };
  });
  return { ...list, items, isLoading: list.isLoading || per.isLoading };
}

/** The connected wallet's position in one v2 collateral. */
export function usePositionV2(token: Address | undefined, user?: Address) {
  const who = useWho(user);
  const c = (functionName: "getPosition" | "collateralRatio" | "maxMintable" | "maxWithdrawable" | "isLiquidatable") =>
    ({ address: V2.vault!, abi: vaultV2Abi, functionName, args: [who!, token!], chainId: CHAIN_ID }) as const;
  const q = useReadContracts({
    contracts: [c("getPosition"), c("collateralRatio"), c("maxMintable"), c("maxWithdrawable"), c("isLiquidatable")],
    query: { enabled: !!V2.vault && !!who && !!token, ...REFRESH },
  });
  const pos = ok<readonly [bigint, bigint]>(q.data?.[0]);
  const ratio = ok<bigint>(q.data?.[1]);
  return {
    ...q,
    collateral: pos?.[0],
    debt: pos?.[1],
    ratioBps: ratio === undefined ? undefined : ratio === 2n ** 256n - 1n ? null : ratio,
    maxMintable: ok<bigint>(q.data?.[2]),
    maxWithdrawable: ok<bigint>(q.data?.[3]),
    isLiquidatable: ok<boolean>(q.data?.[4]),
  };
}

/** Live Move quote: output, fee (output units), size impact and the oracle mid it's anchored to. */
export function useMoveQuote(usdToMxn: boolean, amountIn: bigint | undefined) {
  const q = useReadContract({
    address: V2.amm,
    abi: moveAmmAbi,
    functionName: "quote",
    args: [usdToMxn, amountIn ?? 0n],
    chainId: CHAIN_ID,
    query: { enabled: !!V2.amm && !!amountIn && amountIn > 0n, retry: false, ...REFRESH },
  });
  return { ...q, amountOut: q.data?.[0], fee: q.data?.[1], impactBps: q.data?.[2], mid: q.data?.[3] };
}

/** Move's balance sheet: OUSD reserve vs xMXN it issued, and the resulting coverage. */
export function useMoveState() {
  const q = useReadContract({ address: V2.amm, abi: moveAmmAbi, functionName: "state", chainId: CHAIN_ID, query: { enabled: !!V2.amm, ...REFRESH } });
  const s = q.data;
  return {
    ...q,
    reserve: s?.[0],
    liability: s?.[1],
    equity: s?.[2],
    coverageBps: s?.[3] === undefined ? undefined : s[3] === 2n ** 256n - 1n ? null : s[3],
    redeemedToday: s?.[4],
    redeemCap: s?.[5],
  };
}

/** Balance of any 6dp token for the connected wallet. */
export function useTokenBalance(token: Address | undefined, user?: Address) {
  const who = useWho(user);
  return useReadContract({
    address: token,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: [who!],
    chainId: CHAIN_ID,
    query: { enabled: !!token && !!who, ...REFRESH },
  });
}
