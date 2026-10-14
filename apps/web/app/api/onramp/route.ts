// POST /api/onramp: "Agregar dólares con tarjeta" (lead-approved, crew #mercado 02:43).
// The CARD PAYMENT IS SIMULATED: only the 4242 test card is accepted and nothing is charged (Tempo Wallet's
// real card on-ramp is mainnet-only). The FULFILLMENT IS REAL: the ONRAMP_FLOAT testnet account transfers
// exactly that OUSD to the buyer on Tempo Moderato and we return the tx. Capped per tx and per wallet/day,
// idempotent per key, single-process memory (resets on restart; testnet demo).
import { z } from "zod";
import { createWalletClient, erc20Abi, http, isAddress, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { explorerTx, TEMPO_ADDRESSES, TEMPO_RPC_URL, tempoModerato } from "@mercado/shared";
import { env } from "@/lib/server/env";
import { jsonError, parseJson } from "@/lib/server/http";
import { publicClient } from "@/lib/server/chain";

const MAX_PER_TX_USD = 500;
const MAX_PER_DAY_USD = 1_000;
const TEST_CARD = "4242424242424242";
const LABEL = "Simulated card payment: no card is charged. Tempo Wallet's card on-ramp is mainnet-only. The OUSD delivery is a real testnet transfer.";

const Body = z.object({
  address: z.string().refine(isAddress, "invalid address"),
  amountUsd: z.number().positive().max(MAX_PER_TX_USD),
  card: z.object({ number: z.string(), exp: z.string(), cvc: z.string() }),
  idempotencyKey: z.string().min(8).max(128),
});

type Result = { txHash: Hex; explorerUrl: string; amount: string; token: Address; to: Address; simulatedCharge: { last4: string; label: string } };
const done = new Map<string, Result>();
const inflight = new Map<string, Promise<Result>>();
const spent = new Map<string, { day: string; usd: number }>();
const today = () => new Date().toISOString().slice(0, 10);

export async function POST(request: Request) {
  const [body, err] = await parseJson(request, Body);
  if (err) return err;
  const to = body.address as Address;

  const prior = done.get(body.idempotencyKey);
  if (prior) return Response.json({ ...prior, replay: true });
  const running = inflight.get(body.idempotencyKey);
  if (running) return Response.json(await running);

  if (body.card.number.replace(/\s/g, "") !== TEST_CARD)
    return jsonError(402, "Only the 4242 4242 4242 4242 test card works here: this is a simulated card payment.", "TEST_CARD_ONLY");
  const amountUsd = Math.round(body.amountUsd * 100) / 100;
  const used = spent.get(to.toLowerCase());
  const usedToday = used?.day === today() ? used.usd : 0;
  if (usedToday + amountUsd > MAX_PER_DAY_USD)
    return jsonError(429, `Daily top-up limit reached: US$${MAX_PER_DAY_USD} per wallet per day (US$${usedToday} used).`, "DAILY_CAP");

  const pk = env("ONRAMP_FLOAT_PRIVATE_KEY") as Hex | undefined;
  if (!pk) return jsonError(503, "The on-ramp float isn't configured.", "ONRAMP_UNAVAILABLE");

  // Reserve the day's amount before sending so concurrent requests can't exceed the cap.
  spent.set(to.toLowerCase(), { day: today(), usd: usedToday + amountUsd });
  const job = (async (): Promise<Result> => {
    const account = privateKeyToAccount(pk);
    const wallet = createWalletClient({ account, chain: tempoModerato, transport: http(TEMPO_RPC_URL) });
    const amount = parseUnits(amountUsd.toFixed(2), 6);
    const hash = await wallet.writeContract({ address: TEMPO_ADDRESSES.ousd, abi: erc20Abi, functionName: "transfer", args: [to, amount] } as never);
    const receipt = await publicClient().waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`The OUSD transfer reverted (${hash}).`);
    return {
      txHash: hash,
      explorerUrl: explorerTx(hash),
      amount: amount.toString(),
      token: TEMPO_ADDRESSES.ousd,
      to,
      simulatedCharge: { last4: "4242", label: LABEL },
    };
  })();
  inflight.set(body.idempotencyKey, job);
  try {
    const r = await job;
    done.set(body.idempotencyKey, r);
    return Response.json(r);
  } catch (e) {
    spent.set(to.toLowerCase(), { day: today(), usd: usedToday }); // release the reservation
    return jsonError(502, e instanceof Error ? e.message.split("\n")[0] : "The OUSD transfer failed.", "TRANSFER_FAILED");
  } finally {
    inflight.delete(body.idempotencyKey);
  }
}
