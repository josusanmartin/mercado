// POST /api/onramp: "Agregar dólares con tarjeta" (lead-approved, #mercado 02:43-02:44).
// SIMULATED card charge (only the 4242 test card; nothing is charged; Tempo Wallet's card on-ramp is
// mainnet-only) → REAL OUSD delivery: the server-only ONRAMP_FLOAT account transfers exactly that OUSD
// on Tempo Moderato.
//
// Exactly-once delivery per idempotency key (R-046), across retries, reloads and restarts:
//   1. The key is bound to its payload (address, cents); a changed payload under the same key is a 409.
//   2. The transfer is SIGNED first and its hash persisted (status "signed") BEFORE broadcast.
//   3. Any retry with a pending record reconciles by that hash and never signs a second transfer.
//      Unknown settlement stays "pending" (202) until the chain answers; it is never re-sent.
// Behind ONRAMP_ENABLED (off → 503) until review accepts it. Budgets (R-047): whole cents, US$1–500 per tx; per-wallet and global daily totals computed
// from the persisted ledger (every non-failed record counts), all under one process-wide lock; fail
// closed if the float can't cover the amount. File store .data/onramp.json (lib/remesas/onramp-ledger):
// a corrupt/unreadable ledger fails closed (503 LEDGER_UNAVAILABLE), and an O_EXCL lock file makes it
// single-writer across processes, inside the in-process mutex.
import path from "node:path";
import { z } from "zod";
import { createWalletClient, encodeFunctionData, erc20Abi, http, isAddress, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { explorerTx, TEMPO_ADDRESSES, TEMPO_RPC_URL, tempoModerato } from "@mercado/shared";
import { env, repoRoot } from "@/lib/server/env";
import { jsonError, parseJson } from "@/lib/server/http";
import { publicClient } from "@/lib/server/chain";
import { withKeyLock } from "@/lib/server/bills/lock";
import { LedgerUnavailable, loadLedger, saveLedger, withFileLock, type OnrampIntent, type OnrampLedger } from "@/lib/remesas/onramp-ledger";

const MIN_CENTS = 1_00;
const MAX_PER_TX_CENTS = 500_00;
const MAX_PER_WALLET_DAY_CENTS = 1_000_00;
const MAX_GLOBAL_DAY_CENTS = 10_000_00;
const TEST_CARD = "4242424242424242";
const LABELS = {
  charge: "SIMULATED card charge: no card is charged. Tempo Wallet's card on-ramp is mainnet-only.",
  delivery: "REAL OUSD delivery: a testnet transfer from the Mercado on-ramp float.",
};

const Body = z.object({
  address: z.string().refine(isAddress, "invalid address"),
  amountUsd: z.number().positive(),
  card: z.object({ number: z.string(), exp: z.string(), cvc: z.string() }),
  idempotencyKey: z.string().min(8).max(128),
});

type Intent = OnrampIntent;
type Ledger = OnrampLedger;

const file = () => process.env.MERCADO_ONRAMP_FILE ?? path.join(repoRoot(), ".data", "onramp.json");

const load = () => loadLedger(file());
const save = (l: Ledger) => saveLedger(file(), l);
const today = () => new Date().toISOString().slice(0, 10);
const live = (i: Intent) => i.status !== "failed";

function response(i: Intent) {
  const body = {
    status: i.status === "delivered" ? "delivered" : "pending",
    txHash: i.hash,
    explorerUrl: i.hash ? explorerTx(i.hash) : undefined,
    amount: String(BigInt(i.cents) * 10_000n), // cents → 6dp OUSD
    token: TEMPO_ADDRESSES.ousd,
    to: i.to,
    simulatedCharge: { last4: "4242", label: LABELS.charge },
    delivery: LABELS.delivery,
  };
  return Response.json(body, { status: i.status === "delivered" ? 200 : 202 });
}

/** Settle a signed intent by its hash: broadcast if the chain hasn't seen it, then await the receipt. */
async function settle(i: Intent): Promise<Intent> {
  const client = publicClient();
  const known = await client.getTransactionReceipt({ hash: i.hash! }).catch(() => undefined);
  if (known) return { ...i, status: known.status === "success" ? "delivered" : "failed", error: known.status === "success" ? undefined : "reverted" };
  // Re-broadcasting the SAME signed bytes is idempotent on-chain (same hash, same nonce): never a second transfer.
  await client.sendRawTransaction({ serializedTransaction: i.signed! }).catch(() => undefined);
  const receipt = await client.waitForTransactionReceipt({ hash: i.hash!, timeout: 45_000 }).catch(() => undefined);
  if (!receipt) return i; // unknown settlement: stays "signed" (pending); reconciled on the next request
  return { ...i, status: receipt.status === "success" ? "delivered" : "failed", error: receipt.status === "success" ? undefined : "reverted" };
}

/** Off until review accepts R-046/R-047 (lead): set ONRAMP_ENABLED=1 in the root .env.local to turn it on. */
const enabled = () => env("ONRAMP_ENABLED") === "1";

export async function GET() {
  return Response.json({ enabled: enabled(), minUsd: MIN_CENTS / 100, maxPerTxUsd: MAX_PER_TX_CENTS / 100, maxPerWalletDayUsd: MAX_PER_WALLET_DAY_CENTS / 100 });
}

export async function POST(request: Request) {
  if (!enabled()) return jsonError(503, "Top-up is temporarily unavailable.", "ONRAMP_DISABLED");
  const [body, err] = await parseJson(request, Body);
  if (err) return err;
  const to = (body.address as Address).toLowerCase();
  const cents = Math.round(body.amountUsd * 100);
  if (!Number.isInteger(cents) || Math.abs(body.amountUsd * 100 - cents) > 1e-6)
    return jsonError(400, "Amount must be in whole cents.", "INVALID_AMOUNT");
  if (cents < MIN_CENTS) return jsonError(400, `The minimum top-up is US$${MIN_CENTS / 100}.`, "BELOW_MIN");
  if (cents > MAX_PER_TX_CENTS) return jsonError(400, `At most US$${MAX_PER_TX_CENTS / 100} per top-up.`, "PER_TX_CAP");

  // One lock for the whole ledger (in-process mutex + OS-level file lock): reservation, signing and
  // persistence are serialized across requests AND processes.
  return withKeyLock("onramp-ledger", () => withFileLock(file(), async () => {
    let ledger: Ledger;
    try {
      ledger = load();
    } catch (e) {
      if (e instanceof LedgerUnavailable) return jsonError(503, "Top-up is unavailable while its ledger is being repaired.", "LEDGER_UNAVAILABLE");
      throw e;
    }
    const prior = ledger[body.idempotencyKey];
    if (prior) {
      if (prior.to !== to || prior.cents !== cents) return jsonError(409, "This idempotency key was already used for a different top-up.", "KEY_PAYLOAD_CONFLICT");
      if (prior.status === "delivered") return response(prior);
      if (prior.status === "failed") return jsonError(502, `That top-up failed (${prior.error ?? "unknown"}); nothing was delivered. Start a new one.`, "TRANSFER_FAILED");
      const next = await settle(prior);
      ledger[prior.key] = next;
      save(ledger);
      return response(next);
    }

    if (body.card.number.replace(/\s/g, "") !== TEST_CARD)
      return jsonError(402, "The simulated checkout accepts only the test card 4242 4242 4242 4242.", "TEST_CARD_ONLY");

    const day = today();
    const todays = Object.values(ledger).filter((i) => i.day === day && live(i));
    const walletToday = todays.filter((i) => i.to === to).reduce((a, i) => a + i.cents, 0);
    if (walletToday + cents > MAX_PER_WALLET_DAY_CENTS)
      return jsonError(429, `Daily top-up limit: US$${MAX_PER_WALLET_DAY_CENTS / 100} per wallet (US$${(walletToday / 100).toFixed(2)} used today).`, "WALLET_DAILY_CAP");
    const globalToday = todays.reduce((a, i) => a + i.cents, 0);
    if (globalToday + cents > MAX_GLOBAL_DAY_CENTS) return jsonError(429, "The on-ramp's daily float budget is used up. Try again tomorrow.", "GLOBAL_DAILY_CAP");

    const pk = env("ONRAMP_FLOAT_PRIVATE_KEY") as Hex | undefined;
    if (!pk) return jsonError(503, "The on-ramp float isn't configured.", "ONRAMP_UNAVAILABLE");
    const account = privateKeyToAccount(pk);
    const amount = BigInt(cents) * 10_000n;
    const floatBalance = await publicClient().readContract({ address: TEMPO_ADDRESSES.ousd, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
    // Fail closed: the float must cover this plus everything still pending.
    const pending = Object.values(ledger).filter((i) => i.status === "signed").reduce((a, i) => a + BigInt(i.cents) * 10_000n, 0n);
    if (floatBalance < amount + pending) return jsonError(503, "The on-ramp float is low, so top-ups are paused.", "FLOAT_LOW");

    // Sign first, persist the hash, then broadcast.
    const wallet = createWalletClient({ account, chain: tempoModerato, transport: http(TEMPO_RPC_URL) });
    const req = await wallet.prepareTransactionRequest({
      to: TEMPO_ADDRESSES.ousd,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to as Address, amount] }),
    } as never);
    const signed = (await wallet.signTransaction(req as never)) as Hex;
    const intent: Intent = { key: body.idempotencyKey, to, cents, day, status: "signed", hash: keccak256(signed), signed, createdAt: new Date().toISOString() };
    ledger[intent.key] = intent;
    save(ledger);

    const next = await settle(intent);
    ledger[intent.key] = next;
    save(ledger);
    if (next.status === "failed") return jsonError(502, "The OUSD transfer reverted; nothing was delivered.", "TRANSFER_FAILED");
    return response(next);
  }).catch((e) => {
    if (e instanceof LedgerUnavailable) return jsonError(503, "Top-up is temporarily unavailable.", "LEDGER_UNAVAILABLE");
    throw e;
  }));
}
