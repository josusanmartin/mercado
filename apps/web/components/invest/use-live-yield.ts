"use client";
// Real-time interest for the Invest phone (mobile2). Values are functions of wall-clock time so a counter can
// tick every ~50ms without re-rendering React; every chain read (10s) re-syncs them.
// useLiveVault(vault) is EXACT for the StakedOUSD contract and its instances (sOUSD over OUSD, sxMXN over xMXN):
//   totalAssets(t) = assetsAccounted + min(assetsAccounted·aprBps·(t − checkpointAt) / (10_000·YEAR), fundedReserve)
//   balance(t)     = shares · totalAssets(t) / totalSupply        (ERC-4626 convertToAssets, offset 0)
// Accrual stops when the admin-funded reserve runs out, exactly as on-chain.
import { useCallback } from "react";
import type { Address } from "viem";
import { useConnection, useReadContracts } from "wagmi";
import { activeAddresses, stakedOusdAbi } from "@mercado/shared";
import { CHAIN_ID } from "@/lib/contracts";
import { INVEST } from "./use-invest";

const YEAR = 365 * 24 * 3600;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** sxMXN (lead 03:32): the StakedOUSD contract over xMXN. Resolved from deployments once contracts posts it. */
export const SXMXN: Address | undefined = (() => {
  try {
    const a = activeAddresses() as ReturnType<typeof activeAddresses> & { sxMXN?: Address };
    return a.sxMXN ?? a.collaterals.find((c) => c.symbol === "sxMXN")?.token;
  } catch {
    return undefined;
  }
})();

export type LiveValue = {
  /** Units (not 6dp) at unix seconds `t`, or undefined until the first read. */
  at: (t: number) => number | undefined;
  /** The vault's configured annual rate in bps (undefined until read). */
  aprBps?: number;
  /** Wallet shares (6dp), for "has a position" checks. */
  shares?: bigint;
};

export function useLiveVault(vault: Address | undefined): LiveValue {
  const { address } = useConnection();
  const q = useReadContracts({
    contracts: vault
      ? ([
          { address: vault, abi: stakedOusdAbi, functionName: "assetsAccounted", chainId: CHAIN_ID },
          { address: vault, abi: stakedOusdAbi, functionName: "fundedReserve", chainId: CHAIN_ID },
          { address: vault, abi: stakedOusdAbi, functionName: "checkpointAt", chainId: CHAIN_ID },
          { address: vault, abi: stakedOusdAbi, functionName: "aprBps", chainId: CHAIN_ID },
          { address: vault, abi: stakedOusdAbi, functionName: "totalSupply", chainId: CHAIN_ID },
          { address: vault, abi: stakedOusdAbi, functionName: "balanceOf", args: [address ?? ZERO], chainId: CHAIN_ID },
        ] as const)
      : [],
    query: { enabled: !!vault && !!address, refetchInterval: 10_000 },
  });
  const r = q.data?.map((x) => (x.status === "success" ? (x.result as bigint) : undefined));
  const [A, F, c, apr, S, shares] = r ?? [];
  const ready = [A, F, c, apr, S, shares].every((x) => x !== undefined);
  const at = useCallback(
    (t: number) => {
      if (!ready) return undefined;
      const a = Number(A) / 1e6;
      const f = Number(F) / 1e6;
      const accrued = Math.min((a * Number(apr) * Math.max(0, t - Number(c))) / (10_000 * YEAR), f);
      const supply = Number(S);
      return supply > 0 ? (Number(shares) * (a + accrued)) / supply : 0;
    },
    [ready, A, F, c, apr, S, shares],
  );
  return { at, aprBps: apr !== undefined ? Number(apr) : undefined, shares };
}

export const useLiveDollars = () => useLiveVault(INVEST.sOUSD);
export const useLivePesos = () => useLiveVault(SXMXN);
