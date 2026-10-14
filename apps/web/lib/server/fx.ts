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
  /** The source's own timestamp, when it publishes one (unknown otherwise). */
  sourceTime?: string | null;
  fetchedAt: string;
  onchainAt: string;
  txHash: `0x${string}`;
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

const hhmm = (d: Date) => `${d.toISOString().slice(11, 16)} UTC`;

function relayLabel(r: RelayRecord, updatedAt: bigint) {
  const what =
    r.sourceKind === "daily"
      ? `daily reference rate${r.sourceTime ? ` of ${r.sourceTime.slice(0, 10)}` : ""}`
      : `intraday indicative rate${r.sourceTime ? ` as of ${hhmm(new Date(r.sourceTime))}` : ", source time not published"}`;
  return `Admin-relayed from ${r.source} (${what}) · fetched ${hhmm(new Date(r.fetchedAt))} · on-chain ${hhmm(new Date(Number(updatedAt) * 1000))} (block time) · not a decentralized oracle`;
}

const verified = new Map<string, boolean>();

/**
 * R-037: the relay record only describes the current on-chain value if its tx actually set THIS oracle and
 * the oracle's updatedAt equals that tx's block time (same rate alone isn't enough: an admin reset to the
 * same price would otherwise inherit the relay's provenance).
 */
async function relayBacksCurrentValue(relay: RelayRecord, oracle: Address, px: bigint, updatedAt: bigint) {
  if (relay.mxnPerUsd8 !== px.toString()) return false;
  const key = `${relay.txHash}:${oracle}:${updatedAt}`;
  const hit = verified.get(key);
  if (hit !== undefined) return hit;
  try {
    const client = publicClient();
    const receipt = await client.getTransactionReceipt({ hash: relay.txHash });
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const ok =
      receipt.status === "success" &&
      receipt.to?.toLowerCase() === oracle.toLowerCase() &&
      block.timestamp === updatedAt;
    verified.set(key, ok);
    return ok;
  } catch {
    return false;
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
    const matches = !!relay && (await relayBacksCurrentValue(relay, oracle, mxnPerUsd, updatedAt));
    const feed = matches
      ? relayLabel(relay, updatedAt)
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
              ...(relay.sourceTime ? { sourceTime: relay.sourceTime } : {}),
              fetchedAt: relay.fetchedAt,
              onchainAt: new Date(Number(updatedAt) * 1000).toISOString(),
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
