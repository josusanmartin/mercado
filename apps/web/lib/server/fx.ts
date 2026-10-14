// FX adapter: reads FXOracleAdapter.peek() (8dp mxnPerUsd, never reverts) and reports staleness honestly.
// The testnet oracle is admin-relayed (contracts' keeper pushes a public reference rate); the label says
// exactly where the current on-chain value came from, and when. If the feed can't be read: 503, no fallback.
import { parseAbi, type Address } from "viem";
import type { FxResponse } from "@mercado/shared";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./env";
import { requireAddress } from "./protocol";
import { publicClient } from "./chain";

const oracleAbi = parseAbi([
  "function peek() view returns (uint256 mxnPerUsd, uint256 updatedAt, bool valid)",
  "function isMock() view returns (bool)",
]);

type RelayRecord = {
  mxnPerUsd8: string;
  source: string;
  sourceKind: "intraday" | "daily";
  sourceTime: string;
  fetchedAt: string;
  onchainAt: string;
  txHash: `0x${string}`;
  label: string;
};

/** contracts' FX relay keeper record (packages/contracts/cache/fx-relay.json), if present. */
function readRelay(): RelayRecord | undefined {
  try {
    const file = path.join(repoRoot(), "packages/contracts/cache/fx-relay.json");
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as RelayRecord) : undefined;
  } catch {
    return undefined;
  }
}

export class FxUnavailableError extends Error {
  readonly status = 503;
  readonly code = "FX_UNAVAILABLE";
}

export async function getFx(): Promise<FxResponse> {
  // The active protocol's oracle; throws ProtocolUnavailableError (503) if v2 is active but incomplete.
  const oracle: Address = requireAddress("oracle");
  try {
    const client = publicClient();
    const [[mxnPerUsd, updatedAt, valid], isMock] = await Promise.all([
      client.readContract({ address: oracle, abi: oracleAbi, functionName: "peek" }),
      client.readContract({ address: oracle, abi: oracleAbi, functionName: "isMock" }).catch(() => true),
    ]);
    // The keeper records where the on-chain value came from. Only trust that record if it matches the
    // value actually on-chain (a stress-demo forceSet, for example, won't).
    const relay = readRelay();
    const matches = relay && relay.mxnPerUsd8 === mxnPerUsd.toString();
    const feed = matches
      ? relay.label
      : isMock
        ? "Admin-set testnet FX value (no matching relay record, e.g. a stress-demo override), not a market rate"
        : "On-chain FX oracle (testnet)";
    return {
      mxnPerUsd: mxnPerUsd.toString(),
      rate: Number(mxnPerUsd) / 1e8,
      updatedAt: Number(updatedAt),
      source: matches ? "admin-relay" : "mock-admin-oracle",
      isMock,
      oracle,
      stale: !valid,
      label: valid ? feed : `${feed}. STALE or PAUSED: minting and liquidation are blocked until it is updated`,
      ...(matches
        ? {
            relay: {
              source: relay.source,
              sourceKind: relay.sourceKind,
              sourceTime: relay.sourceTime,
              fetchedAt: relay.fetchedAt,
              onchainAt: relay.onchainAt,
              txHash: relay.txHash,
            },
          }
        : {}),
    };
  } catch (err) {
    // No made-up fallback rate: if the on-chain feed can't be read, say so.
    throw new FxUnavailableError(`The FX oracle can't be read right now: ${(err as Error).message.split("\n")[0]}`);
  }
}
