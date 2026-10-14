import { DriverScoreRequestSchema } from "@mercado/shared";
import { parseUnits, type Address } from "viem";
import { assessDriver } from "@/lib/server/credit";
import { jsonError, parseJson } from "@/lib/server/http";
import { ProtocolUnavailableError, activeProtocolName } from "@/lib/server/protocol";
import { recordPaidCall } from "@/lib/mpp/ledger";
import { billPaymentToken, charge, merchantAddress } from "@/lib/mpp/server";

/** Fee for third-party underwriter access, in decimal xMXN. */
const UNDERWRITER_FEE = "2";

// POST /api/driver/score { borrower, profile }
//   (app, free)              → deterministic demo score + signed EIP-712 Eligibility (15 min expiry).
//   ?access=underwriter (MPP) → 402 until paid; then the score report WITHOUT a borrow attestation
//                               (only the borrower's own app session gets one), plus the payment receipt.
export async function POST(request: Request) {
  const [body, err] = await parseJson(request.clone(), DriverScoreRequestSchema);
  if (err) return err;
  const underwriter = new URL(request.url).searchParams.get("access") === "underwriter";
  try {
    if (!underwriter) return Response.json(await assessDriver(body.borrower as Address, body.profile));

    const token = billPaymentToken();
    const outcome = await charge(request, {
      amount: UNDERWRITER_FEE,
      currency: token.address,
      recipient: merchantAddress(),
      externalId: `score:${body.borrower.toLowerCase()}:${body.profile}`,
      description: `Mercado demo underwriting report (${body.profile}), illustrative only`,
      meta: { product: "underwriting-report" },
      expiresMinutes: 5,
    });
    if (!outcome.paid) return outcome.challenge;
    const report = await assessDriver(body.borrower as Address, body.profile, { borrowCapacityMxn: null });
    await recordPaidCall({
      product: "underwriting",
      txHash: outcome.txHash,
      payer: outcome.payer,
      amount: parseUnits(UNDERWRITER_FEE, 6).toString(),
      token: token.address,
      protocol: activeProtocolName(),
      summary: `${body.profile} · score ${report.score}`,
      at: new Date().toISOString(),
    });
    const { attestation, attestationWithheld, ...rest } = report;
    void attestation;
    void attestationWithheld;
    return Response.json(
      {
        ...rest,
        access: "underwriter",
        payment: { txHash: outcome.txHash, payer: outcome.payer, token: token.address, tokenSymbol: token.symbol },
      },
      { headers: { "Payment-Receipt": outcome.receiptHeader, "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    if (e instanceof ProtocolUnavailableError) return jsonError(503, e.message, e.code);
    console.error("[api/driver/score]", e);
    return jsonError(500, "Scoring failed", "SCORE_FAILED");
  }
}
