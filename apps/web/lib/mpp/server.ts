// Server-side MPP (HTTP 402) setup for Mercado, built on mppx's Tempo charge method.
// Challenges are HMAC-bound (MPP_SECRET_KEY) to amount, token, recipient, chain, externalId and meta, and
// the client's TIP-20 transfer memo is bound to the challenge id, so a payment can settle exactly one order.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Mppx, tempo } from "mppx/server";
import { Challenge, Credential, Receipt } from "mppx";
import type { Address, Hex } from "viem";
import { TEMPO_ADDRESSES, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { getDeployments } from "../server/deployments";
import { fileStore } from "./store";
import { env, repoRoot } from "../server/env";

export const MPP_REALM = "mercado-demo";

/** MPP_SECRET_KEY from env, else a random key persisted in <repo>/.data/mpp-secret (gitignored). */
function secretKey(): string {
  const fromEnv = env("MPP_SECRET_KEY");
  if (fromEnv) return fromEnv;
  const file = path.join(repoRoot(), ".data", "mpp-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(path.dirname(file), { recursive: true });
  const key = randomBytes(32).toString("hex");
  writeFileSync(file, key, { mode: 0o600 });
  return key;
}

export function merchantAddress(): Address {
  const addr = getDeployments().merchant ?? env("MERCHANT_ADDRESS");
  if (!addr) throw new Error("MERCHANT_ADDRESS is not configured");
  return addr as Address;
}

export interface PaymentToken {
  address: Address;
  symbol: string;
  /** true while xMXN isn't deployed and we charge an interim USD test token instead. */
  interim: boolean;
}

/** Bills settle in xMXN. Before xMXN is deployed we fall back to pathUSD (BILL_TOKEN_ADDRESS overrides). */
export function billPaymentToken(): PaymentToken {
  const override = env("BILL_TOKEN_ADDRESS") as Address | undefined;
  if (override) return { address: override, symbol: env("BILL_TOKEN_SYMBOL") ?? "TOKEN", interim: true };
  const xmxn = getDeployments().xMXN;
  if (xmxn) return { address: xmxn, symbol: "xMXN", interim: false };
  return { address: TEMPO_ADDRESSES.pathUSD, symbol: "pathUSD", interim: true };
}

type MppxServer = ReturnType<typeof createMppx>;
function createMppx() {
  return Mppx.create({
    realm: MPP_REALM,
    secretKey: secretKey(),
    methods: [
      tempo.charge({
        testnet: true,
        decimals: 6,
        recipient: merchantAddress(),
        currency: billPaymentToken().address,
        store: fileStore(),
      }),
    ],
  });
}

// One instance per process (Next dev bundles routes separately, so keep it on globalThis). Replay
// markers persist in .data/mppx-store.json.
const KEY = Symbol.for("mercado.mppx.server");
export function mppx(): MppxServer {
  const g = globalThis as typeof globalThis & { [KEY]?: MppxServer };
  g[KEY] ??= createMppx();
  return g[KEY]!;
}

export interface ChargeOptions {
  /** Decimal token units, e.g. "100" = 100 xMXN. */
  amount: string;
  currency: Address;
  recipient: Address;
  /** Binds the challenge to one order/resource. Pinned by mppx (HMAC + stable binding). */
  externalId: string;
  description: string;
  /** Extra opaque binding (also HMAC-bound and compared on retry). */
  meta?: Record<string, string>;
  /** Challenge lifetime in minutes (default 10). */
  expiresMinutes?: number;
}

export type ChargeOutcome =
  | { paid: false; challenge: Response }
  | {
      paid: true;
      receipt: ReturnType<typeof Receipt.deserialize>;
      receiptHeader: string;
      txHash: Hex;
      payer?: Address;
      externalId?: string;
    };

/**
 * Runs the MPP charge for `request`. Unpaid (or invalid credential) → { paid:false, challenge: 402 Response }.
 * Paid → the transfer was verified on-chain by mppx (amount, token, recipient, memo bound to the challenge).
 */
export async function charge(request: Request, opts: ChargeOptions): Promise<ChargeOutcome> {
  const result = await mppx().charge({
    amount: opts.amount,
    currency: opts.currency,
    recipient: opts.recipient,
    externalId: opts.externalId,
    description: opts.description,
    meta: opts.meta,
    expires: new Date(Date.now() + (opts.expiresMinutes ?? 10) * 60_000).toISOString(),
    chainId: TEMPO_MODERATO_CHAIN_ID,
  })(request);

  if (result.status === 402) return { paid: false, challenge: result.challenge as Response };

  const stamped = (await result.withReceipt(new Response(null, { status: 204 }))) as Response;
  const receiptHeader = stamped.headers.get("Payment-Receipt")!;
  const receipt = Receipt.deserialize(receiptHeader);

  let payer: Address | undefined;
  let externalId: string | undefined;
  try {
    const header = request.headers.get("Authorization") ?? "";
    const cred = Credential.deserialize(Credential.extractPaymentScheme(header) ?? header);
    externalId = (cred.challenge.request as { externalId?: string }).externalId;
    const m = cred.source?.match(/0x[0-9a-fA-F]{40}$/);
    if (m) payer = m[0] as Address;
  } catch {
    /* payer is best-effort; the receipt is authoritative */
  }
  return { paid: true, receipt, receiptHeader, txHash: receipt.reference as Hex, payer, externalId };
}

/** Payload type of the MPP credential on `request`, if any: "hash" = client already broadcast (push). */
export function credentialKind(request: Request): "hash" | "transaction" | "proof" | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  try {
    const cred = Credential.deserialize<{ type?: string }>(Credential.extractPaymentScheme(header) ?? header);
    const t = cred.payload?.type;
    return t === "hash" || t === "transaction" || t === "proof" ? t : null;
  } catch {
    return null;
  }
}

export interface CredentialInfo {
  kind: "hash" | "transaction" | "proof";
  challengeId: string;
  externalId?: string;
  expires?: string;
  /** Push mode: the already-broadcast tx hash. */
  txHash?: Hex;
}

/**
 * Parses the MPP credential on `request` and returns it only if its challenge was issued by THIS server
 * (HMAC check with our secret). Null when absent, malformed or foreign.
 */
export function ownCredential(request: Request): CredentialInfo | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  try {
    const cred = Credential.deserialize<{ type?: string; hash?: string }>(Credential.extractPaymentScheme(header) ?? header);
    if (!Challenge.verify(cred.challenge, { secretKey: secretKey() })) return null;
    const kind = cred.payload?.type;
    if (kind !== "hash" && kind !== "transaction" && kind !== "proof") return null;
    return {
      kind,
      challengeId: cred.challenge.id,
      externalId: (cred.challenge.request as { externalId?: string }).externalId,
      expires: cred.challenge.expires,
      txHash: kind === "hash" ? (cred.payload.hash as Hex) : undefined,
    };
  } catch {
    return null;
  }
}
