import { DriverScoreRequestSchema } from "@mercado/shared";
import { parseUnits, type Address } from "viem";
import { assessDriver } from "@/lib/server/credit";
import { jsonError, parseJson } from "@/lib/server/http";
import {
  ProtocolUnavailableError,
  activeProtocolName,
} from "@/lib/server/protocol";
import { paidOnce } from "@/lib/mpp/paid-once";
import { PRICES } from "@/lib/mpp/pricing";
import { billPaymentToken, merchantAddress } from "@/lib/mpp/server";

const UNDERWRITER_FEE = PRICES.underwriting;

// POST /api/driver/score { borrower, profile }
//   (app, free)              → deterministic demo score + signed EIP-712 Eligibility (15 min expiry).
//   ?access=underwriter (MPP) → 402 until paid; then the score report WITHOUT a borrow attestation
//                               (only the borrower's own app session gets one), plus the payment receipt.
export async function POST(request: Request) {
  const [body, err] = await parseJson(
    request.clone(),
    DriverScoreRequestSchema,
  );
  if (err) return err;
  const underwriter =
    new URL(request.url).searchParams.get("access") === "underwriter";
  try {
    if (!underwriter)
      return Response.json(
        await assessDriver(body.borrower as Address, body.profile, {
          platform: body.platform,
        }),
      );

    const token = billPaymentToken();
    return await paidOnce(request, {
      product: "underwriting",
      charge: {
        amount: UNDERWRITER_FEE,
        currency: token.address,
        recipient: merchantAddress(),
        externalId: `score:${body.borrower.toLowerCase()}:${body.platform}:${body.profile}`,
        description: `Mercado demo underwriting report (${body.profile}), illustrative only`,
        meta: { product: "underwriting-report" },
        expiresMinutes: 5,
      },
      feeUnits: parseUnits(UNDERWRITER_FEE, 6).toString(),
      token: token.address,
      protocol: activeProtocolName(),
      summary: `${body.platform} · ${body.profile}`,
      // post-payment work (deterministic): re-run on a recovery retry without a new charge
      produce: () =>
        assessDriver(body.borrower as Address, body.profile, {
          borrowCapacityMxn: null,
          platform: body.platform,
        }),
      respond: (report, p) => {
        const { attestation, attestationWithheld, ...rest } = report;
        void attestation;
        void attestationWithheld;
        return Response.json(
          {
            ...rest,
            access: "underwriter",
            payment: {
              txHash: p.txHash,
              payer: p.payer,
              token: token.address,
              tokenSymbol: token.symbol,
            },
          },
          {
            headers: {
              "Payment-Receipt": p.receiptHeader,
              "Cache-Control": "private, no-store",
            },
          },
        );
      },
    });
  } catch (e) {
    if (e instanceof ProtocolUnavailableError)
      return jsonError(503, e.message, e.code);
    console.error("[api/driver/score]", e);
    return jsonError(500, "Scoring failed", "SCORE_FAILED");
  }
}
