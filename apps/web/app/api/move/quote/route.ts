import { MoveQuoteQuerySchema } from "@mercado/shared";
import { parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { billPaymentToken, merchantAddress } from "@/lib/mpp/server";
import { paidOnce } from "@/lib/mpp/paid-once";
import { canonicalJson } from "@/lib/server/credit";
import { env } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";
import { activeProtocolName, ProtocolUnavailableError } from "@/lib/server/protocol";
import { MoveQuoteError, quoteMove } from "@/lib/server/move/quote";
import { PRICES } from "@/lib/mpp/pricing";

const PARTNER_FEE = PRICES["move-quote"];

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

    // Fail closed BEFORE the 402: a partner must never pay for a quote we can't sign or price.
    const key = env("ATTESTATION_SIGNER_PRIVATE_KEY") as Hex | undefined;
    if (!key) return jsonError(503, "The quote signing key isn't configured.", "SIGNER_UNAVAILABLE");
    const signer = privateKeyToAccount(key);
    await quoteMove(side, amount);
    const token = billPaymentToken();
    return await paidOnce(request, {
      product: "move-quote",
      charge: {
        amount: PARTNER_FEE,
        currency: token.address,
        recipient: merchantAddress(),
        externalId: `move-quote:${side}:${amount}`,
        description: `Mercado signed indicative quote (${side}, ${amount}): 30s expiry, minimum received bound on-chain`,
        meta: { product: "move-quote" },
        expiresMinutes: 5,
      },
      feeUnits: parseUnits(PARTNER_FEE, 6).toString(),
      token: token.address,
      protocol: activeProtocolName(),
      summary: `${side} ${amount} · signed quote`,
      // post-payment work: a fresh quote (30s expiry) signed by Mercado's quote key; re-run on a recovery retry
      produce: async () => {
        const quote = await quoteMove(side, amount);
        return { quote, signature: await signer.signMessage({ message: canonicalJson(quote) }) };
      },
      respond: ({ quote, signature }, p) =>
        Response.json(
          { ...quote, signature, signer: signer.address, payment: { txHash: p.txHash, payer: p.payer, tokenSymbol: token.symbol } },
          { headers: { "Payment-Receipt": p.receiptHeader, "Cache-Control": "private, no-store" } },
        ),
    });
  } catch (e) {
    if (e instanceof MoveQuoteError) return jsonError(e.status, e.message, e.code);
    if (e instanceof ProtocolUnavailableError) return jsonError(503, e.message, e.code);
    console.error("[api/move/quote]", e);
    return jsonError(500, "Quote failed", "QUOTE_FAILED");
  }
}
