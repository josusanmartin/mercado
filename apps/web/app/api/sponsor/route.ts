// POST /api/sponsor: Tempo fee-payer relay (JSON-RPC), TESTNET ONLY.
// Clients use `sponsoredTransport()` from lib/contracts (viem `withRelay(http(rpc), http(origin + "/api/sponsor"))`).
// The relay co-signs as fee payer for the app's own calls (see policy.ts), so drivers and passkey users need no
// fee tokens. Anything refused falls back to the sender paying its own fees.
// GET returns the sponsor address, policy and limits.
import { createClient, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Relay } from "viem/tempo";
import { FEE_TOKEN, tempoModerato } from "@mercado/shared";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { env, repoRoot } from "@/lib/server/env";
import { gatedTransport } from "./upstream";
import {
  ALLOWED_TARGETS,
  FEE_TOKENS,
  GLOBAL_PER_HOUR,
  MAX_FEE_PER_GAS,
  MAX_GAS,
  MAX_PRIORITY_FEE,
  MAX_TX_COST,
  PER_SENDER_PER_HOUR,
  REQUESTS_PER_IP_PER_MINUTE,
  allowIp,
  consumeQuota,
  fillKey,
  refusal,
  senderEligible,
  type SponsorRequest,
} from "./policy";

// demo personas (roles in Demo mode) + the demo merchant terminal, which submits Card charges
const PERSONA_VARS = [
  "LP_ADDRESS",
  "SENDER_ADDRESS",
  "SENDER2_ADDRESS",
  "RECIPIENT_ADDRESS",
  "RECIPIENT_PAPA_ADDRESS",
  "RECIPIENT_ANA_ADDRESS",
  "DRIVER_ADDRESS",
  "LENDER_ADDRESS",
  "SAVER_ADDRESS",
  "MERCHANT_ADDRESS",
];

/** Read a var from env, re-reading the root .env.local if the server started before it was added. */
function rootVar(name: string): string | undefined {
  const v = env(name);
  if (v) return v;
  const file = path.join(repoRoot(), ".env.local");
  if (process.env.VERCEL || !existsSync(file)) return undefined; // deployments inject process.env, no file
  const m = readFileSync(file, "utf8").match(new RegExp(`^${name}=(\\S+)$`, "m"));
  return m?.[1];
}

function sponsorKey(): `0x${string}` {
  const key = rootVar("SPONSOR_PRIVATE_KEY");
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Missing SPONSOR_PRIVATE_KEY (expected in repo-root .env.local or the deployment env)");
  return key as `0x${string}`;
}

function createRelay() {
  const account = privateKeyToAccount(sponsorKey());
  const personas = new Set(PERSONA_VARS.map(rootVar).filter((a): a is string => !!a).map((a) => a.toLowerCase()));
  return Relay.create({
    client: createClient({ chain: tempoModerato, transport: gatedTransport() }),
    plugins: [
      Relay.feePayer({
        account,
        name: "Mercado testnet sponsor",
        // Without this Tempo would charge the sponsor in the called token (e.g. xMXN, which can't pay fees).
        feeToken: FEE_TOKEN,
        validate: async (tx) => {
          const req = tx as SponsorRequest;
          const why = refusal(req);
          if (why) {
            console.warn("[sponsor] refused:", why, req.from);
            return false;
          }
          if (!(await senderEligible(req.from as Address, personas, req))) {
            console.warn("[sponsor] refused: sender has no OUSD/xMXN/position", req.from);
            return false;
          }
          return consumeQuota(req.from as Address, fillKey(req)) ? true : "spend_limit_exceeded";
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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (!allowIp(ip)) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32005, message: "Sponsor rate limit: too many requests, slow down." } },
      { status: 429 },
    );
  }
  // viem's withRelay polls account_getOperation while a receipt is pending. This relay co-signs only (no accounts
  // plugin), so answer Method-not-found right here: viem reads -32601 as "no operation store" and falls back to
  // the receipt quietly. Through Relay it surfaced as -32603 Internal error and was retried ~4× per charge.
  const body = (await req
    .clone()
    .json()
    .catch(() => undefined)) as { id?: number | string | null; method?: string } | undefined;
  if (body && !Array.isArray(body) && typeof body.method === "string" && body.method.startsWith("account_")) {
    return Response.json({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: `Method not found: ${body.method}` } });
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
      senders: "demo personas, or addresses holding OUSD/xMXN or a vault/pool position",
      maxGas: MAX_GAS.toString(),
      maxFeePerGas: MAX_FEE_PER_GAS.toString(),
      maxPriorityFeePerGas: MAX_PRIORITY_FEE.toString(),
      maxTxCost: MAX_TX_COST.toString(),
      feeTokens: [...FEE_TOKENS],
      perSenderPerHour: PER_SENDER_PER_HOUR,
      globalPerHour: GLOBAL_PER_HOUR,
      requestsPerIpPerMinute: REQUESTS_PER_IP_PER_MINUTE,
      budgets: "in-memory, single process; reset on restart",
    },
  });
}
