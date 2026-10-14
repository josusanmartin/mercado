"use client";
// "Agregar dólares": (a) simulated card checkout whose OUSD delivery is a REAL on-chain transfer from the
// on-ramp float (POST /api/onramp, 4242 test card only, capped); (b) the REAL Tempo Wallet funding flow
// via wallet_deposit for Tempo Wallet users (faucet on testnet, card/Apple Pay on mainnet).
import { useCallback, useState } from "react";
import { useConnection } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { TEMPO_ADDRESSES, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { useReportBusy } from "@/lib/busy";

export type OnrampStage = "idle" | "charging" | "delivering" | "done" | "error";
export type OnrampResult = { txHash: `0x${string}`; explorerUrl: string; amount: string; simulatedCharge: { last4: string; label: string } };

export const ONRAMP_TEST_CARD = { number: "4242 4242 4242 4242", exp: "12/34", cvc: "123" };
export const ONRAMP_LABEL = "Simulated card payment: no card is charged. Tempo Wallet's card on-ramp is mainnet-only. The dollars you receive are a real testnet OUSD transfer.";
export const ONRAMP_MAX_PER_TX = 500;

export function useOnramp() {
  const { address, connector } = useConnection();
  const qc = useQueryClient();
  const [stage, setStage] = useState<OnrampStage>("idle");
  const [result, setResult] = useState<OnrampResult>();
  const [error, setError] = useState<string>();
  useReportBusy(stage === "charging" || stage === "delivering");

  const buyWithCard = useCallback(
    async (amountUsd: number, card = ONRAMP_TEST_CARD) => {
      if (!address) return;
      setError(undefined);
      setResult(undefined);
      setStage("charging");
      // The card step is simulated (no processor); give it a visible beat, then the real transfer runs.
      const t = setTimeout(() => setStage("delivering"), 900);
      try {
        const res = await fetch("/api/onramp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, amountUsd, card, idempotencyKey: crypto.randomUUID() }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Top-up failed (${res.status})`);
        setResult(body);
        setStage("done");
        await qc.invalidateQueries();
        return body as OnrampResult;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStage("error");
      } finally {
        clearTimeout(t);
      }
    },
    [address, qc],
  );

  /** Real Tempo Wallet funding UI (only for Tempo Wallet / passkey connections). */
  const canTempoDeposit = connector?.type === "tempoWallet" || connector?.type === "webAuthn";
  const tempoDeposit = useCallback(
    async (amountUsd?: number) => {
      if (!connector || !address) return;
      const provider = (await connector.getProvider()) as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
      await provider.request({
        method: "wallet_deposit",
        params: [{ address, chainId: TEMPO_MODERATO_CHAIN_ID, token: TEMPO_ADDRESSES.ousd, ...(amountUsd ? { amount: String(amountUsd) } : {}) }],
      });
      // A resolved request doesn't prove funding (Tempo docs); balances refresh from chain.
      await qc.invalidateQueries();
    },
    [connector, address, qc],
  );

  return { stage, result, error, buyWithCard, canTempoDeposit, tempoDeposit, reset: () => (setStage("idle"), setResult(undefined), setError(undefined)) };
}
