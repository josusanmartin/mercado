"use client";
// Live "Try it": a REAL paid call from the connected wallet (Demo mode: the API partner persona), recording
// every step of the MPP handshake: request → 402 challenge (decoded) → signed payment → 200 + Payment-Receipt.
import { useCallback, useRef, useState } from "react";
import { Fetch, Mppx, tempo } from "mppx/client";
import { Receipt, type Challenge } from "mppx";
import { useWalletClient } from "wagmi";
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { useReportBusy } from "@/lib/busy";
import { QUOTE_BODY, type PaidEndpoint } from "./endpoints";

export type TraceStep = {
  at: number; // ms since start
  kind: "request" | "challenge" | "credential" | "response" | "error" | "quote";
  title: string;
  detail?: Record<string, string | number | undefined>;
};

export type TryItResult = {
  status: number;
  receipt?: ReturnType<typeof Receipt.deserialize>;
  body?: unknown;
};

export function useTryIt(endpoint: PaidEndpoint, borrower: string) {
  const { data: walletClient } = useWalletClient();
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [result, setResult] = useState<TryItResult>();
  const [busy, setBusy] = useState(false);
  const t0 = useRef(0);
  useReportBusy(busy);

  const log = useCallback((s: Omit<TraceStep, "at">) => {
    setTrace((tr) => [
      ...tr,
      { ...s, at: Math.round(performance.now() - t0.current) },
    ]);
  }, []);

  const run = useCallback(async () => {
    if (!walletClient?.account || busy) return;
    setBusy(true);
    setTrace([]);
    setResult(undefined);
    t0.current = performance.now();
    const raw = Fetch.unwrapFetch(globalThis.fetch);
    try {
      let body = endpoint.body?.({ borrower });
      if (endpoint.needsQuote) {
        log({
          kind: "quote",
          title: "POST /api/bills/quote (free)",
          detail: { body: JSON.stringify(QUOTE_BODY) },
        });
        const q = await (
          await raw("/api/bills/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(QUOTE_BODY),
          })
        ).json();
        if (!q.quoteId) throw new Error(q.error ?? "Quote failed");
        body = endpoint.body!({
          borrower,
          quoteId: q.quoteId,
          idempotencyKey: crypto.randomUUID(),
        });
        log({
          kind: "quote",
          title: `Quote ${q.quoteId.slice(0, 14)}…`,
          detail: {
            amount: `${Number(q.amount) / 1e6} ${q.tokenSymbol}`,
            description: q.description,
          },
        });
      }

      const mppx = Mppx.create({
        polyfill: false,
        methods: [
          tempo.charge({
            expectedChainId: TEMPO_MODERATO_CHAIN_ID,
            account: walletClient.account,
            getClient: () => walletClient,
          }),
        ],
      });
      mppx.onChallengeReceived(
        ({ challenge }: { challenge: Challenge.Challenge }) => {
          const req = challenge.request as {
            amount?: string;
            currency?: string;
            recipient?: string;
            externalId?: string;
            methodDetails?: { chainId?: number };
          };
          log({
            kind: "challenge",
            title: "402 Payment Required",
            detail: {
              "challenge id": challenge.id,
              method: `${challenge.method}/${challenge.intent}`,
              amount: req.amount
                ? `${Number(req.amount) / 1e6} xMXN`
                : undefined,
              currency: req.currency,
              recipient: req.recipient,
              externalId: req.externalId,
              chainId: req.methodDetails?.chainId,
              expires: challenge.expires,
              description: challenge.description,
            },
          });
          return undefined;
        },
      );
      mppx.onCredentialCreated(() => {
        log({
          kind: "credential",
          title: "Payment signed: TIP-20 transfer memo-bound to the challenge",
          detail: { payer: walletClient.account!.address },
        });
      });

      log({
        kind: "request",
        title: `${endpoint.method} ${endpoint.path}`,
        detail: body ? { body: JSON.stringify(body) } : undefined,
      });
      const res = await mppx.fetch(endpoint.path, {
        method: endpoint.method,
        ...(endpoint.method === "POST"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      let receipt: TryItResult["receipt"];
      try {
        receipt = Receipt.fromResponse(res);
      } catch {
        receipt = undefined;
      }
      const json = await res.json().catch(() => undefined);
      log({
        kind: res.ok ? "response" : "error",
        title: `${res.status} ${res.ok ? "OK" : res.statusText}${receipt ? " + Payment-Receipt" : ""}`,
        detail: receipt
          ? {
              reference: receipt.reference,
              status: receipt.status,
              method: receipt.method,
              timestamp: receipt.timestamp,
            }
          : { error: (json as { error?: string } | undefined)?.error },
      });
      setResult({ status: res.status, receipt, body: json });
    } catch (e) {
      log({
        kind: "error",
        title: "Failed",
        detail: { error: (e as Error).message.split("\n")[0] },
      });
    } finally {
      setBusy(false);
    }
  }, [walletClient, busy, endpoint, borrower, log]);

  return { run, trace, result, busy, ready: !!walletClient?.account };
}
