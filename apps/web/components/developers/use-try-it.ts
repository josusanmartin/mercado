"use client";
// Live "Try it": a REAL paid call from the connected wallet (Demo mode: the API partner persona), recording
// every step of the MPP handshake: request → 402 challenge (decoded) → signed payment → 200 + Payment-Receipt.
import { useCallback, useRef, useState } from "react";
import { Fetch, Mppx, tempo } from "mppx/client";
import { Receipt, type Challenge } from "mppx";
import { useWalletClient } from "wagmi";
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { useReportBusy } from "@/lib/busy";
import { checkBillSettlement } from "@/lib/mpp/client";
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

/**
 * Bill pay buys something, so an attempt whose outcome is unknown (crash/network error after paying) is
 * remembered per browser by its quote + idempotency key. The next Run reconciles THAT order first (same
 * key, no credential, never pays) and resumes it if unpaid, instead of buying a second top-up.
 */
type PendingBill = { quoteId: string; idempotencyKey: string };
const PENDING_KEY = "mercado.developers.tryit.bills.pending";
function loadPending(): PendingBill | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null");
    return v?.quoteId && v?.idempotencyKey ? v : undefined;
  } catch {
    return undefined;
  }
}
function savePending(p: PendingBill | undefined) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable: the in-memory copy still guards this tab */
  }
}

export function useTryIt(endpoint: PaidEndpoint, borrower: string) {
  const { data: walletClient } = useWalletClient();
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [result, setResult] = useState<TryItResult>();
  const [busy, setBusy] = useState(false);
  const t0 = useRef(0);
  const [pending, setPendingState] = useState<PendingBill | undefined>(() =>
    endpoint.needsQuote ? loadPending() : undefined,
  );
  const setPending = useCallback((p: PendingBill | undefined) => {
    savePending(p);
    setPendingState(p);
  }, []);
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
      let bill: PendingBill | undefined;
      if (endpoint.needsQuote && pending) {
        log({
          kind: "quote",
          title: "Unresolved order from a previous run: re-checking it (same idempotency key, no payment)",
          detail: { quoteId: pending.quoteId, idempotencyKey: pending.idempotencyKey },
        });
        const check = await checkBillSettlement(pending.quoteId, pending.idempotencyKey);
        if (check.state === "settled") {
          setPending(undefined);
          log({
            kind: "response",
            title: "Already paid: recovered the existing order (nothing paid again)",
            detail: { order: check.order.orderId, status: check.order.status },
          });
          setResult({ status: 200, body: check.order });
          return;
        }
        if (check.state === "pending") {
          log({ kind: "error", title: "Settlement still pending: run again in a few seconds", detail: { error: check.message } });
          return;
        }
        if (check.state === "unpaid") {
          bill = pending; // no payment found on-chain: resume THIS order instead of opening a new one
          log({ kind: "quote", title: "Not paid yet: resuming the same order" });
        } else setPending(undefined); // closed without payment: start fresh
      }
      if (endpoint.needsQuote && bill) {
        body = endpoint.body!({ borrower, ...bill });
      } else if (endpoint.needsQuote) {
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
        bill = { quoteId: q.quoteId, idempotencyKey: crypto.randomUUID() };
        body = endpoint.body!({ borrower, ...bill });
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
      // remembered BEFORE paying, cleared only once the outcome is known
      if (bill) setPending(bill);
      let res: Response;
      try {
        res = await mppx.fetch(endpoint.path, {
        method: endpoint.method,
        ...(endpoint.method === "POST"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
        });
      } catch (err) {
        if (!bill) throw err;
        // the client failed, possibly after paying: ask the server (same key, no credential)
        const check = await checkBillSettlement(bill.quoteId, bill.idempotencyKey).catch(() => undefined);
        if (check?.state === "settled") {
          setPending(undefined);
          log({
            kind: "response",
            title: "Paid: the order settled (recovered by idempotency key)",
            detail: { order: check.order.orderId, status: check.order.status },
          });
          setResult({ status: 200, body: check.order });
          return;
        }
        if (check?.state === "closed") setPending(undefined);
        throw err;
      }
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
      // a definite answer (paid, or a 4xx refusal) closes the attempt; 409 pending / 5xx keep it for recovery
      if (bill && (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 409)))
        setPending(undefined);
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
  }, [walletClient, busy, endpoint, borrower, log, pending, setPending]);

  return { run, trace, result, busy, pending, ready: !!walletClient?.account };
}
