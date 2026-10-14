// FX adapter: reads FXOracleAdapter.peek() (8dp mxnPerUsd, never reverts) and reports staleness honestly.
// The testnet oracle is an ADMIN MOCK feed; responses always say so. Before deploy we fall back to a
// labeled config value with updatedAt 0 (never "updated just now").
import { parseAbi, type Address } from "viem";
import type { FxResponse } from "@mercado/shared";
import { getDeployments } from "./deployments";
import { env } from "./env";
import { publicClient } from "./chain";

const oracleAbi = parseAbi([
  "function peek() view returns (uint256 mxnPerUsd, uint256 updatedAt, bool valid)",
  "function isMock() view returns (bool)",
]);

/** Fallback when no oracle is readable: FX_FALLBACK_MXN_PER_USD (8dp int) or 18.50. Illustrative only. */
const DEFAULT_FALLBACK = 1_850_000_000n;

export async function getFx(): Promise<FxResponse> {
  const oracle = (getDeployments().oracle ?? env("FX_ORACLE_ADDRESS")) as Address | undefined;
  let reason = "oracle not deployed yet";
  if (oracle) {
    try {
      const client = publicClient();
      const [[mxnPerUsd, updatedAt, valid], isMock] = await Promise.all([
        client.readContract({ address: oracle, abi: oracleAbi, functionName: "peek" }),
        client.readContract({ address: oracle, abi: oracleAbi, functionName: "isMock" }).catch(() => true),
      ]);
      const feed = isMock ? "Testnet admin-controlled mock FX feed, not a live market rate" : "On-chain FX oracle (testnet)";
      return {
        mxnPerUsd: mxnPerUsd.toString(),
        rate: Number(mxnPerUsd) / 1e8,
        updatedAt: Number(updatedAt),
        source: "mock-admin-oracle",
        isMock,
        oracle,
        stale: !valid,
        label: valid ? feed : `${feed}. STALE or PAUSED: minting and liquidation are blocked until it is updated`,
      };
    } catch (err) {
      reason = `oracle unreadable: ${(err as Error).message.split("\n")[0]}`;
    }
  }
  const raw = env("FX_FALLBACK_MXN_PER_USD");
  const fallback = raw && /^\d+$/.test(raw) ? BigInt(raw) : DEFAULT_FALLBACK;
  return {
    mxnPerUsd: fallback.toString(),
    rate: Number(fallback) / 1e8,
    updatedAt: 0,
    source: "config-fallback",
    isMock: true,
    oracle,
    stale: true,
    label: `Illustrative config value, not a live rate and not usable for minting (${reason})`,
  };
}
