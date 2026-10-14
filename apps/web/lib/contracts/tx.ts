"use client";
// useTx(): run one or more contract writes with status, a readable revert reason and explorer links.
// Each write is simulated first (so reverts surface before the wallet prompt), then sent and awaited.
import { useCallback, useRef, useState } from "react";
import type { Abi, Address, Hash, Log } from "viem";
import { useConfig } from "wagmi";
import { getConnection, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { explorerTx } from "@mercado/shared";
import { CHAIN_ID } from "./addresses";
import { readableError } from "./errors";

export type TxStatus = "idle" | "simulating" | "signing" | "pending" | "success" | "error";

/** Minimal receipt shape (Tempo receipts carry extra fields and statuses). */
export type TxReceipt = { status: string; transactionHash: Hash; blockNumber: bigint; logs: Log[] };

export type TxStep = { label: string; hash: Hash; url: string; receipt?: TxReceipt };

export type WriteRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

export type TxApi = {
  /** The account that started the flow. Every step is pinned to it. */
  account: Address;
  /** Simulate, sign, send and wait for one write. Throws (already recorded in state) on failure. */
  write: (req: WriteRequest, label: string) => Promise<TxStep>;
};

export function useTx() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [stepLabel, setStepLabel] = useState<string>();
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [error, setError] = useState<string>();
  const [rawError, setRawError] = useState<unknown>();
  const busy = useRef(false);

  /** Abort if the wallet switched account or chain since the flow started (R-012). */
  const assertSameWallet = useCallback(
    (account: Address) => {
      const now = getConnection(config);
      if (!now.address || now.address.toLowerCase() !== account.toLowerCase())
        throw new Error("The wallet account changed during this flow, so it was stopped. Start again.");
      if (now.chainId !== undefined && now.chainId !== CHAIN_ID)
        throw new Error("The wallet switched networks during this flow, so it was stopped. Switch back to Tempo Moderato.");
    },
    [config],
  );

  const write = useCallback(
    async (account: Address, req: WriteRequest, label: string): Promise<TxStep> => {
      assertSameWallet(account);
      setStepLabel(label);
      setStatus("simulating");
      const { request } = await simulateContract(config, {
        ...(req as Parameters<typeof simulateContract>[1]),
        account,
        chainId: CHAIN_ID,
      });
      setStatus("signing");
      assertSameWallet(account);
      // The registered config narrows `chain` to tempoModerato; the simulated request is for that chain.
      const hash = await writeContract(config, request as never);
      const step: TxStep = { label, hash, url: explorerTx(hash) };
      setSteps((s) => [...s, step]);
      setStatus("pending");
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID });
      if (receipt.status !== "success") throw new Error(`${label} reverted on-chain (${hash}).`);
      step.receipt = receipt as unknown as TxReceipt;
      setSteps((s) => s.map((x) => (x.hash === hash ? { ...step } : x)));
      return step;
    },
    [config, assertSameWallet],
  );

  /** Run a flow of one or more writes. Resolves to the steps, or undefined on failure (see `error`). */
  const run = useCallback(
    async (flow: (tx: TxApi) => Promise<unknown>): Promise<TxStep[] | undefined> => {
      if (busy.current) return undefined; // ignore double clicks
      busy.current = true;
      setSteps([]);
      setError(undefined);
      setRawError(undefined);
      const done: TxStep[] = [];
      try {
        const conn = getConnection(config);
        const account = conn.address;
        if (!account) throw new Error("Connect a wallet first.");
        if (conn.chainId !== undefined && conn.chainId !== CHAIN_ID)
          throw new Error("Switch your wallet to Tempo Moderato (chain 42431).");
        await flow({
          account,
          write: async (req, label) => {
            const s = await write(account, req, label);
            done.push(s);
            return s;
          },
        });
        setStatus("success");
        return done;
      } catch (e) {
        setRawError(e);
        setError(readableError(e));
        setStatus("error");
        return undefined;
      } finally {
        busy.current = false;
        setStepLabel(undefined);
        await queryClient.invalidateQueries();
        // the public RPC's "latest" can trail the receipt by a block; refetch once more shortly after
        setTimeout(() => void queryClient.invalidateQueries(), 2_000);
      }
    },
    [config, write, queryClient],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setSteps([]);
    setError(undefined);
    setRawError(undefined);
  }, []);

  const last = steps.at(-1);
  return {
    run,
    reset,
    status,
    /** Label of the step in flight, e.g. "Approve OUSD". */
    stepLabel,
    steps,
    hash: last?.hash,
    explorerUrl: last?.url,
    error,
    rawError,
    isBusy: status === "simulating" || status === "signing" || status === "pending",
  };
}
