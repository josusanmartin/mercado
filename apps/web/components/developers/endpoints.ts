// The MPP-paid Mercado APIs shown on /developers. Prices are NOT here: they come live from
// GET /api/mpp/pricing (the same constants the routes charge).
export type EndpointId = "underwriting" | "move-quote" | "bills";

export interface PaidEndpoint {
  id: EndpointId;
  title: string;
  product: string;
  method: "GET" | "POST";
  path: string;
  /** What the caller gets after paying. */
  returns: string;
  summary: string;
  /** Request body for POST endpoints (example values the live Try-it uses). */
  body?: (ctx: {
    borrower: string;
    quoteId?: string;
    idempotencyKey?: string;
  }) => Record<string, unknown>;
  /** Bill pay needs a free quote first. */
  needsQuote?: boolean;
}

export const ENDPOINTS: PaidEndpoint[] = [
  {
    id: "underwriting",
    title: "Underwriting report",
    product: "Mercado Crédito",
    method: "POST",
    path: "/api/driver/score?access=underwriter",
    returns:
      "score · credit line · features · plain-language reasons · dataHash (no borrow attestation)",
    summary:
      "A driver's demo underwriting report, computed from synthetic platform earnings (Demo Uber / DiDi / Rappi Data). Illustrative score, not a credit model.",
    body: ({ borrower }) => ({ borrower, profile: "steady", platform: "uber" }),
  },
  {
    id: "move-quote",
    title: "Partner FX quote",
    product: "Mercado Global",
    method: "GET",
    path: "/api/move/quote?side=usd_to_mxn&amount=250&access=partner",
    returns:
      "rate · oracle mid · spread · size impact · minimum received · 30s expiry · EIP-191 signature",
    summary:
      "A signed indicative quote (cotización indicativa firmada) from Mercado's exchange. You pay for the quote, not the payment: execution is bound only by the swap's minimum received.",
  },
  {
    id: "bills",
    title: "Bill pay (Tiempo Aire)",
    product: "Mercado Remesas",
    method: "POST",
    path: "/api/bills/pay",
    returns:
      "order · on-chain receipt · SIMULATED fulfillment reference (no real top-up)",
    summary:
      "Pay a quoted Telcel top-up or CFE bill. Get a free quote first (POST /api/bills/quote), then pay it here. A retry with the same idempotency key returns the same order instead of opening a new one (a payment already broadcast when the client crashed is reconciled against the chain). Fulfillment is SIMULATED.",
    needsQuote: true,
    body: ({ quoteId, idempotencyKey }) => ({
      quoteId: quoteId ?? "q_…",
      idempotencyKey: idempotencyKey ?? "<uuid>",
    }),
  },
];

const QUOTE_BODY = { provider: "telcel", phone: "5512345678", amountMxn: 20 };
export { QUOTE_BODY };

/** Copy-paste curl that shows the 402 (no payment). */
export function curlFor(e: PaidEndpoint, origin: string, borrower: string) {
  const url = `${origin}${e.path}`;
  if (e.id === "bills")
    return [
      `# 1) free quote`,
      `Q=$(curl -s -X POST "${origin}/api/bills/quote" -H 'content-type: application/json' \\`,
      `  -d '${JSON.stringify(QUOTE_BODY)}' | jq -r .quoteId)`,
      `KEY=$(uuidgen)  # keep it: a retry with the same key returns the same order`,
      `# 2) pay it: the API answers 402 with the MPP challenge`,
      `curl -i -X POST "${url}" -H 'content-type: application/json' \\`,
      `  -d "{\\"quoteId\\":\\"$Q\\",\\"idempotencyKey\\":\\"$KEY\\"}"`,
    ].join("\n");
  if (e.method === "GET")
    return `curl -i "${url}"\n# → HTTP/1.1 402 Payment Required + WWW-Authenticate: Payment id=…, request=…`;
  return [
    `curl -i -X POST "${url}" -H 'content-type: application/json' \\`,
    `  -d '${JSON.stringify(e.body!({ borrower }))}'`,
    `# → HTTP/1.1 402 Payment Required + WWW-Authenticate: Payment id=…, request=…`,
  ].join("\n");
}

/** ~10-line mppx client that pays and retries automatically. */
export function snippetFor(e: PaidEndpoint, origin: string, borrower: string) {
  const call =
    e.id === "bills"
      ? `const q = await (await fetch("${origin}/api/bills/quote", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(${JSON.stringify(QUOTE_BODY)}),
})).json();
const idempotencyKey = crypto.randomUUID(); // reuse it on retry: the server returns the same order
const res = await mppx.fetch("${origin}${e.path}", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ quoteId: q.quoteId, idempotencyKey }),
});`
      : e.method === "GET"
      ? `const res = await mppx.fetch("${origin}${e.path}");`
      : `const res = await mppx.fetch("${origin}${e.path}", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(${JSON.stringify(e.body!({ borrower, quoteId: "q_…", idempotencyKey: "<uuid>" }))}),
});`;
  return `import { Mppx, tempo } from "mppx/client";
import { createClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as \`0x\${string}\`);
const chain = tempoModerato.extend({ feeToken: "0x20c0000000000000000000000000000000000001" }); // fees in a USD token
const mppx = Mppx.create({ polyfill: false, methods: [tempo.charge({ account, getClient: () => createClient({ chain, transport: http(), account }) })] });

${call} // 402 → pays on Tempo → retries with the credential
console.log(res.status, res.headers.get("Payment-Receipt"), await res.json());`;
}
