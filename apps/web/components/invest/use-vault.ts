"use client";
// Deposit/withdraw for a StakedOUSD-style savings vault (mobile2). Used for sxMXN ("Ahorro en pesos", lead
// 03:32); same flow as use-invest's depositDolares/withdrawDolares: approve the exact amount if needed, then
// ERC-4626 deposit(assets, me) / withdraw(assets, me, me). Fee-sponsored like every Invest write.
import { useCallback } from "react";
import { erc20Abi, type Abi, type Address } from "viem";
import { useConfig, useConnection, useReadContracts } from "wagmi";
import { readContract } from "wagmi/actions";
import { stakedOusdAbi } from "@mercado/shared";
import { CHAIN_ID, useTx, type TxApi } from "@/lib/contracts";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Wallet balance of the underlying + what the vault lets this wallet withdraw now (6dp). */
export function useVaultPosition(vault: Address | undefined, asset: Address) {
  const { address } = useConnection();
  const who = address ?? ZERO;
  const q = useReadContracts({
    contracts: [
      { address: asset, abi: erc20Abi, functionName: "balanceOf", args: [who], chainId: CHAIN_ID },
      ...(vault ? [{ address: vault, abi: stakedOusdAbi, functionName: "maxWithdraw", args: [who], chainId: CHAIN_ID }] : []),
      ...(vault ? [{ address: vault, abi: stakedOusdAbi, functionName: "yieldReserve", chainId: CHAIN_ID }] : []),
    ] as never,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const d = q.data as { status: string; result?: unknown }[] | undefined;
  const v = (i: number) => (d?.[i]?.status === "success" ? (d[i].result as bigint) : undefined);
  return { wallet: v(0), withdrawable: vault ? v(1) : undefined, yieldReserve: vault ? v(2) : undefined };
}

export function useVaultActions(vault: Address | undefined, asset: Address, symbol: string) {
  const config = useConfig();
  const tx = useTx();
  const approve = useCallback(
    async (t: TxApi, amount: bigint) => {
      const allowance = await readContract(config, { address: asset, abi: erc20Abi, functionName: "allowance", args: [t.account, vault!], chainId: CHAIN_ID });
      if (allowance < amount) await t.write({ address: asset, abi: erc20Abi as Abi, functionName: "approve", args: [vault!, amount] }, `Aprobar ${symbol}`);
    },
    [config, asset, vault, symbol],
  );
  return {
    tx,
    deposit: (amount: bigint) =>
      tx.run(async (t) => {
        if (!vault) throw new Error("Ahorro no disponible todavía.");
        await approve(t, amount);
        await t.write({ address: vault, abi: stakedOusdAbi as Abi, functionName: "deposit", args: [amount, t.account] }, `Depositar ${symbol}`);
      }),
    withdraw: (amount: bigint) =>
      tx.run(async (t) => {
        if (!vault) throw new Error("Ahorro no disponible todavía.");
        await t.write({ address: vault, abi: stakedOusdAbi as Abi, functionName: "withdraw", args: [amount, t.account, t.account] }, `Retirar ${symbol}`);
      }),
  };
}
