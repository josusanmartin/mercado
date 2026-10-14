// FX adapter: reads FXOracleAdapter.peek() (8dp mxnPerUsd, never reverts) and reports staleness honestly.
// The testnet oracle is an ADMIN MOCK feed; responses always say so. Before deploy we fall back to a
// labeled config value with updatedAt 0 (never "updated just now").
import { parseAbi, type Address } from "viem";
import type { FxResponse } from "@mercado/shared";
import { requireAddress } from "./protocol";
import { publicClient } from "./chain";

const oracleAbi = parseAbi([
  "function peek() view returns (uint256 mxnPerUsd, uint256 updatedAt, bool valid)",
  "function isMock() view returns (bool)",
]);

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
    // No made-up fallback rate: if the on-chain feed can't be read, say so.
    throw new FxUnavailableError(`The FX oracle can't be read right now: ${(err as Error).message.split("\n")[0]}`);
  }
}
