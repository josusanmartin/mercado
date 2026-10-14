import { MoveQuoteQuerySchema } from "@mercado/shared";
import { formatUnits, parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { billPaymentToken, charge, merchantAddress } from "@/lib/mpp/server";
import { canonicalJson } from "@/lib/server/credit";
import { env } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";
import { ProtocolUnavailableError } from "@/lib/server/protocol";
import { MoveQuoteError, quoteMove } from "@/lib/server/move/quote";
import { recordPaidCall } from "@/lib/mpp/ledger";

/** Partner fee per signed indicative quote (MPP buys the API response, not the payment itself). */
const PARTNER_FEE = "0.50"; // xMXN

// GET /api/move/quote?side=usd_to_mxn|mxn_to_usd&amount=100
//   (app, free)          → indicative quote from the v2 vAMM, or the v1 SwapDesk fallback.
//   ?access=partner (MPP) → 402 until paid (0.50 xMXN); then the same quote signed (EIP-191) by Mercado's
//                           quote key, plus the payment receipt. Still indicative: minOut binds execution.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = MoveQuoteQuerySchema.safeParse({
    side: url.searchParams.get("side") ?? undefined,
    amount: url.searchParams.get("amount") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "Use ?side=usd_to_mxn|mxn_to_usd&amount=<decimal>", "VALIDATION", parsed.error.issues);
  const { side, amount } = parsed.data;
  const partner = url.searchParams.get("access") === "partner";

  try {
    if (!partner) return Response.json(await quoteMove(side, amount), { headers: { "Cache-Control": "no-store" } });

    // Price first, so a partner never pays for a quote we can't give.
    await quoteMove(side, amount);
    const token = billPaymentToken();
    const outcome = await charge(request, {
      amount: PARTNER_FEE,
      currency: token.address,
      recipient: merchantAddress(),
      externalId: `move-quote:${side}:${amount}`,
      description: `Mercado signed indicative quote (${side}, ${amount}): 30s expiry, minimum received bound on-chain`,
      meta: { product: "move-quote" },
      expiresMinutes: 5,
    });
    if (!outcome.paid) return outcome.challenge;

    const quote = await quoteMove(side, amount);
    await recordPaidCall({
      product: "move-quote",
      txHash: outcome.txHash,
      payer: outcome.payer,
      amount: parseUnits(PARTNER_FEE, 6).toString(),
      token: token.address,
      protocol: quote.protocol,
      summary: `${side} ${amount} → ${formatUnits(BigInt(quote.amountOut), 6)} ${quote.symbolOut}`,
      at: new Date().toISOString(),
    });
    const key = env("ATTESTATION_SIGNER_PRIVATE_KEY") as Hex | undefined;
    let signed: { signature?: Hex; signer?: `0x${string}` } = {};
    if (key) {
      const account = privateKeyToAccount(key);
      signed = { signature: await account.signMessage({ message: canonicalJson(quote) }), signer: account.address };
    }
    return Response.json(
      { ...quote, ...signed, payment: { txHash: outcome.txHash, payer: outcome.payer, tokenSymbol: token.symbol } },
      { headers: { "Payment-Receipt": outcome.receiptHeader, "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    if (e instanceof MoveQuoteError) return jsonError(e.status, e.message, e.code);
    if (e instanceof ProtocolUnavailableError) return jsonError(503, e.message, e.code);
    console.error("[api/move/quote]", e);
    return jsonError(500, "Quote failed", "QUOTE_FAILED");
  }
}
