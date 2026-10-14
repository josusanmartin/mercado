"use client";
// useTx(): run one or more contract writes with status, a readable revert reason and explorer links.
// Each write is simulated first (so reverts surface before the wallet prompt), then sent and awaited.
import { useCallback, useRef, useState } from "react";
import type { Abi, Address, Hash, TransactionReceipt } from "viem";
import { useConfig } from "wagmi";
import { getConnection, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { explorerTx } from "@mercado/shared";
import { CHAIN_ID } from "./addresses";
import { readableError } from "./errors";

export type TxStatus = "idle" | "simulating" | "signing" | "pending" | "success" | "error";

export type TxStep = { label: string; hash: Hash; url: string; receipt?: TransactionReceipt };

export type WriteRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

export type TxApi = {
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

  const write = useCallback<TxApi["write"]>(
    async (req, label) => {
      setStepLabel(label);
      setStatus("simulating");
      const account = getConnection(config).address;
      const { request } = await simulateContract(config, {
        ...(req as Parameters<typeof simulateContract>[1]),
        account,
        chainId: CHAIN_ID,
      });
      setStatus("signing");
      const hash = await writeContract(config, request as Parameters<typeof writeContract>[1]);
      const step: TxStep = { label, hash, url: explorerTx(hash) };
      setSteps((s) => [...s, step]);
      setStatus("pending");
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID });
      if (receipt.status !== "success") throw new Error(`${label} reverted on-chain (${hash}).`);
      step.receipt = receipt;
      setSteps((s) => s.map((x) => (x.hash === hash ? { ...step } : x)));
      return step;
    },
    [config],
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
        await flow({
          write: async (req, label) => {
            const s = await write(req, label);
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
      }
    },
    [write, queryClient],
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
