// POST /api/sponsor: Tempo fee-payer relay (JSON-RPC), TESTNET ONLY.
// Clients use viem's `withFeePayer(http(rpc), http(origin + "/api/sponsor"))` and send with `feePayer: true`;
// this relay co-signs as fee payer for allowlisted Mercado calls, so drivers/passkey users need no fee tokens.
// GET returns the sponsor address, policy and limits.
import { createClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Relay } from "viem/tempo";
import { FEE_TOKEN, tempoModerato, TEMPO_RPC_URL } from "@mercado/shared";
import { readFileSync } from "node:fs";
import path from "node:path";
import { env, repoRoot } from "@/lib/server/env";
import {
  ALLOWED_TARGETS,
  FEE_TOKENS,
  GLOBAL_PER_HOUR,
  MAX_FEE_PER_GAS,
  MAX_GAS,
  MAX_PRIORITY_FEE,
  MAX_TX_COST,
  PER_SENDER_PER_HOUR,
  consumeQuota,
  refusal,
} from "./policy";

/** SPONSOR_PRIVATE_KEY from env, re-reading the root .env.local if the server started before it was added. */
function sponsorKey(): `0x${string}` {
  let key = env("SPONSOR_PRIVATE_KEY");
  if (!key) {
    const m = readFileSync(path.join(repoRoot(), ".env.local"), "utf8").match(/^SPONSOR_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m);
    key = m?.[1];
  }
  if (!key) throw new Error("Missing SPONSOR_PRIVATE_KEY (expected in repo-root .env.local)");
  return key as `0x${string}`;
}

function createRelay() {
  const account = privateKeyToAccount(sponsorKey());
  return Relay.create({
    client: createClient({ chain: tempoModerato, transport: http(TEMPO_RPC_URL) }),
    plugins: [
      Relay.feePayer({
        account,
        name: "Mercado testnet sponsor",
        // Without this Tempo would charge the sponsor in the called token (e.g. xMXN, which can't pay fees).
        feeToken: FEE_TOKEN,
        validate: (tx) => {
          const why = refusal(tx as Parameters<typeof refusal>[0]);
          if (why) {
            console.warn("[sponsor] refused:", why, (tx as { from?: string }).from);
            return false;
          }
          return consumeQuota((tx as { from: `0x${string}` }).from) ? true : "spend_limit_exceeded";
        },
      }),
    ],
  });
}

let relay: ReturnType<typeof createRelay> | undefined;
const getRelay = () => (relay ??= createRelay());

export async function POST(req: Request) {
  if (Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? tempoModerato.id) !== tempoModerato.id) {
    return Response.json({ error: "sponsorship is testnet-only" }, { status: 403 });
  }
  return getRelay().fetch(req);
}

export async function GET() {
  const sponsor = privateKeyToAccount(sponsorKey()).address;
  return Response.json({
    testnet: true,
    chainId: tempoModerato.id,
    sponsor,
    label: "Testnet fee sponsorship: Mercado pays network fees for its own contract calls (rate-limited).",
    policy: {
      targets: [...ALLOWED_TARGETS],
      maxGas: MAX_GAS.toString(),
      maxFeePerGas: MAX_FEE_PER_GAS.toString(),
      maxPriorityFeePerGas: MAX_PRIORITY_FEE.toString(),
      maxTxCost: MAX_TX_COST.toString(),
      feeTokens: [...FEE_TOKENS],
      perSenderPerHour: PER_SENDER_PER_HOUR,
      globalPerHour: GLOBAL_PER_HOUR,
    },
  });
}
