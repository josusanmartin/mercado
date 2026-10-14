"use client";
// The MPP handshake as a visible checklist: quote → 402 Payment Required → pay → verified on-chain → fulfilled.
import type { BillPayResponse } from "@mercado/shared";
import type { FlowStage } from "./use-bill-pay";

const STEPS = [
  {
    id: "quote",
    label: "Quote locked",
    detail: "Price and merchant fixed for 15 minutes",
  },
  {
    id: "challenge",
    label: "402 Payment Required",
    detail: "Server returns an MPP challenge bound to this order",
  },
  {
    id: "pay",
    label: "Pay on Tempo",
    detail:
      "Your wallet sends xMXN to the merchant, memo-bound to the challenge",
  },
  {
    id: "verify",
    label: "Verified on-chain",
    detail: "Server checks amount, token, recipient and memo",
  },
  {
    id: "fulfil",
    label: "Top-up (SIMULATED)",
    detail: "Mock provider returns a reference; no real airtime",
  },
] as const;

function reached(stage: FlowStage, result?: BillPayResponse): number {
  if (result) return result.status === "FULFILLED_SIMULATED" ? 5 : 4;
  switch (stage) {
    case "quoted":
    case "requesting":
      return 1;
    case "challenge":
      return 2;
    case "signing":
    case "verifying":
      return 3;
    default:
      return stage === "idle" || stage === "quoting" ? 0 : 1;
  }
}

export function PayStepper({
  stage,
  result,
}: {
  stage: FlowStage;
  result?: BillPayResponse;
}) {
  const done = reached(stage, result);
  const failed = result && result.status === "FAILED";
  return (
    <ol className="grid gap-2">
      {STEPS.map((s, i) => {
        const state =
          i < done
            ? "done"
            : i === done && stage !== "error" && stage !== "quoted" && !result
              ? "active"
              : "todo";
        const isFailedStep = failed && i === 4;
        return (
          <li key={s.id} className="flex gap-3 text-sm">
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                isFailedStep
                  ? "bg-destructive text-white"
                  : state === "done"
                    ? "bg-product text-white"
                    : state === "active"
                      ? "animate-pulse bg-product-soft text-product"
                      : "bg-muted text-muted-foreground"
              }`}
            >
              {isFailedStep ? "!" : state === "done" ? "✓" : i + 1}
            </span>
            <span>
              <span
                className={
                  state === "todo" && !isFailedStep
                    ? "text-muted-foreground"
                    : "font-medium"
                }
              >
                {s.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {s.detail}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
