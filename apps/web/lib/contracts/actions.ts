"use client";
// One hook with every protocol write, each wrapped in useTx() with approve-if-needed.
//   const m = useMercado();
//   await m.deposit(toUnits("100"));          // Approve OUSD (if needed) → Deposit
//   m.tx.status / m.tx.stepLabel / m.tx.error / m.tx.steps[i].url
import { useCallback } from "react";
import { isAddress, parseEventLogs, stringToHex, type Abi, type Address, type Hex } from "viem";
import { useConfig } from "wagmi";
import { readContract } from "wagmi/actions";
import { ADDR, CHAIN_ID } from "./addresses";
import { creditPoolAbi, swapDeskAbi, tokenAbi, vaultAbi } from "./abis";
import { readableError } from "./errors";
import { useTx, type TxApi } from "./tx";

/** Fields from POST /api/driver/score → attestation (strings as the API returns them). */
export type Attestation = {
  maxAmount: string | bigint;
  expiry: number | bigint;
  nonce: string | bigint;
  dataHash: Hex;
  signature: Hex;
};

export const MEMO_MAX_BYTES = 32;

/** UTF-8 byte length of a memo (accented letters take 2 bytes). Use for the Send screen's counter. */
export const memoByteLength = (memo: string) => new TextEncoder().encode(memo).length;

/** Encode a short remittance note (≤ 32 bytes UTF-8) as a TIP-20 bytes32 memo. */
export function memoToBytes32(memo: string): Hex {
  const n = memoByteLength(memo);
  if (n > MEMO_MAX_BYTES) throw new Error(`The note is ${n} bytes; the limit is ${MEMO_MAX_BYTES} (accented letters count as 2).`);
  return stringToHex(memo, { size: 32 });
}

function checkRecipient(to: string): asserts to is Address {
  if (!isAddress(to)) throw new Error("Enter a valid recipient address (0x…).");
}

/** Apply slippage (bps) to a quoted output to get minOut. */
export const withSlippage = (amountOut: bigint, slippageBps = 50n) => (amountOut * (10_000n - slippageBps)) / 10_000n;

export function useMercado() {
  const config = useConfig();
  const tx = useTx();

  const approveIfNeeded = useCallback(
    async (t: TxApi, token: Address, spender: Address, amount: bigint, symbol: string) => {
      const owner = t.account; // pinned for the whole flow (R-012)
      const allowance = await readContract(config, {
        address: token,
        abi: tokenAbi,
        functionName: "allowance",
        args: [owner, spender],
        chainId: CHAIN_ID,
      });
      if (allowance < amount) {
        await t.write({ address: token, abi: tokenAbi as Abi, functionName: "approve", args: [spender, amount] }, `Approve ${symbol}`);
      }
    },
    [config],
  );

  const call = (address: Address, abi: Abi, functionName: string, args: readonly unknown[]) => ({
    address,
    abi,
    functionName,
    args,
  });
  const vault = (fn: string, args: readonly unknown[]) => call(ADDR.vault, vaultAbi as Abi, fn, args);
  const desk = (fn: string, args: readonly unknown[]) => call(ADDR.swapDesk, swapDeskAbi as Abi, fn, args);
  const pool = (fn: string, args: readonly unknown[]) => call(ADDR.creditPool, creditPoolAbi as Abi, fn, args);

  return {
    tx,

    // ---------------------------------------------------------------- vault (Create pesos)
    deposit: (amount: bigint) =>
      tx.run(async (t) => {
        await approveIfNeeded(t, ADDR.ousd, ADDR.vault, amount, "OUSD");
        await t.write(vault("depositCollateral", [amount]), "Deposit OUSD");
      }),
    /** Optional convenience: deposit then mint in one flow. */
    depositAndMint: (collateral: bigint, xmxn: bigint) =>
      tx.run(async (t) => {
        if (collateral > 0n) {
          await approveIfNeeded(t, ADDR.ousd, ADDR.vault, collateral, "OUSD");
          await t.write(vault("depositCollateral", [collateral]), "Deposit OUSD");
        }
        await t.write(vault("mint", [xmxn]), "Mint xMXN");
      }),
    mint: (xmxn: bigint) => tx.run((t) => t.write(vault("mint", [xmxn]), "Mint xMXN")),
    repayAndBurn: (xmxn: bigint) =>
      tx.run(async (t) => {
        await approveIfNeeded(t, ADDR.xmxn, ADDR.vault, xmxn, "xMXN");
        await t.write(vault("repayAndBurn", [xmxn]), "Repay & burn xMXN");
      }),
    withdrawCollateral: (amount: bigint) => tx.run((t) => t.write(vault("withdrawCollateral", [amount]), "Withdraw OUSD")),
    liquidate: (user: Address, debtToCover: bigint) =>
      tx.run(async (t) => {
        await approveIfNeeded(t, ADDR.xmxn, ADDR.vault, debtToCover, "xMXN");
        await t.write(vault("liquidate", [user, debtToCover]), "Liquidate");
      }),

    // ---------------------------------------------------------------- swap desk (Send money)
    /** Swap with a minimum output computed from `quotedOut` minus `slippageBps` (default 0.5%). */
    swap: (ousdToXmxn: boolean, amountIn: bigint, quotedOut: bigint, slippageBps = 50n) =>
      tx.run(async (t) => {
        const minOut = withSlippage(quotedOut, slippageBps);
        if (ousdToXmxn) {
          await approveIfNeeded(t, ADDR.ousd, ADDR.swapDesk, amountIn, "OUSD");
          await t.write(desk("swapOusdForXmxn", [amountIn, minOut]), "Swap OUSD → xMXN");
        } else {
          await approveIfNeeded(t, ADDR.xmxn, ADDR.swapDesk, amountIn, "xMXN");
          await t.write(desk("swapXmxnForOusd", [amountIn, minOut]), "Swap xMXN → OUSD");
        }
      }),
    /** Plain TIP-20 transfer, or transferWithMemo when a memo is given (visible on the explorer). */
    transfer: (token: Address, to: Address, amount: bigint, memo?: string) =>
      tx.run((t) => {
        checkRecipient(to);
        const memo32 = memo ? memoToBytes32(memo) : undefined; // validate before anything is signed
        return memo32
          ? t.write(call(token, tokenAbi as Abi, "transferWithMemo", [to, amount, memo32]), "Send")
          : t.write(call(token, tokenAbi as Abi, "transfer", [to, amount]), "Send");
      }),
    /** Swap OUSD → xMXN then send the xMXN received to `to` (with optional memo), as one flow. */
    swapAndSend: (amountIn: bigint, quotedOut: bigint, to: Address, memo?: string, slippageBps = 50n) =>
      tx.run(async (t) => {
        // R-017: validate everything the final send needs BEFORE approving or swapping
        checkRecipient(to);
        const memo32 = memo ? memoToBytes32(memo) : undefined;
        const minOut = withSlippage(quotedOut, slippageBps);
        await approveIfNeeded(t, ADDR.ousd, ADDR.swapDesk, amountIn, "OUSD");
        const swapped = await t.write(desk("swapOusdForXmxn", [amountIn, minOut]), "Swap OUSD → xMXN");
        // forward exactly what the swap paid out (from the Swapped event), not the quote
        const [ev] = parseEventLogs({ abi: swapDeskAbi, eventName: "Swapped", logs: swapped.receipt?.logs ?? [] });
        const send = ev?.args.amountOut ?? minOut;
        try {
          await t.write(
            memo32
              ? call(ADDR.xmxn, tokenAbi as Abi, "transferWithMemo", [to, send, memo32])
              : call(ADDR.xmxn, tokenAbi as Abi, "transfer", [to, send]),
            "Send xMXN",
          );
        } catch (e) {
          // the swap already happened: don't make the user swap again, just retry the send
          throw new Error(
            `The swap went through (you now hold the xMXN), but sending failed: ${readableError(e)} Retry with "Send only", no new swap needed.`,
          );
        }
      }),

    // ---------------------------------------------------------------- credit pool (Advance / Earn)
    supply: (amount: bigint) =>
      tx.run(async (t) => {
        await approveIfNeeded(t, ADDR.xmxn, ADDR.creditPool, amount, "xMXN");
        await t.write(pool("supply", [amount]), "Supply xMXN");
      }),
    withdrawSupply: (amount: bigint) => tx.run((t) => t.write(pool("withdrawAvailable", [amount]), "Withdraw xMXN")),
    borrow: (amount: bigint, a: Attestation) =>
      tx.run((t) =>
        t.write(
          pool("borrow", [amount, BigInt(a.maxAmount), BigInt(a.expiry), BigInt(a.nonce), a.dataHash, a.signature]),
          "Draw advance",
        ),
      ),
    repayLoan: (amount: bigint) =>
      tx.run(async (t) => {
        await approveIfNeeded(t, ADDR.xmxn, ADDR.creditPool, amount, "xMXN");
        await t.write(pool("repay", [amount]), "Repay advance");
      }),
  };
}
