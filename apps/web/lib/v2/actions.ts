"use client";
// v2 writes composed on contracts' useTx (simulate → sign → confirm, readable errors, pinned account).
import { useCallback } from "react";
import type { Abi, Address } from "viem";
import { useConfig } from "wagmi";
import { readContract } from "wagmi/actions";
import { ADDR, CHAIN_ID, tokenAbi, useTx, withSlippage, type TxApi } from "@/lib/contracts";
import { moveAmmAbi, vaultV2Abi } from "./abis";
import { V2 } from "./addresses";

export function useMercadoV2() {
  const config = useConfig();
  const tx = useTx();

  const approveIfNeeded = useCallback(
    async (t: TxApi, token: Address, spender: Address, amount: bigint, symbol: string) => {
      const allowance = await readContract(config, { address: token, abi: tokenAbi, functionName: "allowance", args: [t.account, spender], chainId: CHAIN_ID });
      if (allowance < amount) await t.write({ address: token, abi: tokenAbi as Abi, functionName: "approve", args: [spender, amount] }, `Approve ${symbol}`);
    },
    [config],
  );

  const need = <T,>(v: T | undefined, what: string): T => {
    if (!v) throw new Error(`v2 ${what} isn't deployed yet.`);
    return v;
  };
  const vault = (fn: string, args: readonly unknown[]) => ({ address: need(V2.vault, "vault"), abi: vaultV2Abi as Abi, functionName: fn, args });
  const amm = (fn: string, args: readonly unknown[]) => ({ address: need(V2.amm, "MoveAMM"), abi: moveAmmAbi as Abi, functionName: fn, args });

  return {
    tx,
    /** Create: deposit `collateral` of `token` (if any) then mint `xmxn` (if any), one flow. */
    depositAndMint: (token: Address, symbol: string, collateral: bigint, xmxn: bigint) =>
      tx.run(async (t) => {
        if (collateral > 0n) {
          await approveIfNeeded(t, token, need(V2.vault, "vault"), collateral, symbol);
          await t.write(vault("depositCollateral", [token, collateral]), `Deposit ${symbol}`);
        }
        if (xmxn > 0n) await t.write(vault("mint", [token, xmxn]), "Mint xMXN");
      }),
    repayAndBurn: (token: Address, xmxn: bigint) =>
      tx.run(async (t) => {
        await approveIfNeeded(t, need(V2.xmxn, "xMXN"), need(V2.vault, "vault"), xmxn, "xMXN");
        await t.write(vault("repayAndBurn", [token, xmxn]), "Repay & burn xMXN");
      }),
    withdrawCollateral: (token: Address, symbol: string, amount: bigint) =>
      tx.run((t) => t.write(vault("withdrawCollateral", [token, amount]), `Withdraw ${symbol}`)),
    /** Move: OUSD in mints xMXN straight to `to` (one tx for a remittance). */
    sendUsdToMxn: (amountIn: bigint, quotedOut: bigint, to: Address, slippageBps = 50n) =>
      tx.run(async (t) => {
        await approveIfNeeded(t, ADDR.ousd, need(V2.amm, "MoveAMM"), amountIn, "OUSD");
        await t.write(amm("swapOusdForXmxn", [amountIn, withSlippage(quotedOut, slippageBps), to]), "Mint and deliver xMXN");
      }),
    /** Move: xMXN in is burned and redeems OUSD to `to`. */
    sendMxnToUsd: (amountIn: bigint, quotedOut: bigint, to: Address, slippageBps = 50n) =>
      tx.run(async (t) => {
        await approveIfNeeded(t, need(V2.xmxn, "xMXN"), need(V2.amm, "MoveAMM"), amountIn, "xMXN");
        await t.write(amm("swapXmxnForOusd", [amountIn, withSlippage(quotedOut, slippageBps), to]), "Burn xMXN and deliver OUSD");
      }),
  };
}
