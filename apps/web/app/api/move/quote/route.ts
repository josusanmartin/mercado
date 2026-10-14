import { MoveQuoteQuerySchema } from "@mercado/shared";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { billPaymentToken, charge, merchantAddress } from "@/lib/mpp/server";
import { canonicalJson } from "@/lib/server/credit";
import { env } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";
import { ProtocolUnavailableError } from "@/lib/server/protocol";
import { MoveQuoteError, quoteMove } from "@/lib/server/move/quote";

/** Partner fee per signed quote, in decimal token units. */
const PARTNER_FEE = { xMXN: "0.50", interim: "0.03" };

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
      amount: token.interim ? PARTNER_FEE.interim : PARTNER_FEE.xMXN,
      currency: token.address,
      recipient: merchantAddress(),
      externalId: `move-quote:${side}:${amount}`,
      description: `Mercado MOVE signed quote (${side}, ${amount}), demo testnet pricing`,
      meta: { product: "move-quote" },
      expiresMinutes: 5,
    });
    if (!outcome.paid) return outcome.challenge;

    const quote = await quoteMove(side, amount);
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
