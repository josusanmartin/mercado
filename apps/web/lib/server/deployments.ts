// Reads deployed addresses at request time from packages/shared/src/deployments/42431.json (written by the
// contracts deploy script), so redeploys are picked up without restarting the dev server. Missing file → {}.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./env";

export type Deployments = Partial<{
  chainId: number;
  dOUSD: `0x${string}`;
  ousd: `0x${string}`;
  /** v2 stack (crew/V2-DESIGN.md), deployed alongside v1. */
  v2: Partial<{ vamm: `0x${string}`; vault: `0x${string}`; xMXN: `0x${string}`; creditPool: `0x${string}` }>;
  xMXN: `0x${string}`;
  factory: `0x${string}`;
  oracle: `0x${string}`;
  vault: `0x${string}`;
  swapDesk: `0x${string}`;
  creditPool: `0x${string}`;
  attestationSigner: `0x${string}`;
  merchant: `0x${string}`;
  deployedAt: string;
}>;

const ADDR = /^0x[0-9a-fA-F]{40}$/;

export function getDeployments(chainId = 42431): Deployments {
  const file = path.join(repoRoot(), "packages/shared/src/deployments", `${chainId}.json`);
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    // Drop placeholders like "0x…" or zero addresses so callers can use `?? fallback`.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v.startsWith("0x") && (!ADDR.test(v) || /^0x0{40}$/.test(v))) continue;
      out[k] = v;
    }
    return out as Deployments;
  } catch {
    return {};
  }
}
