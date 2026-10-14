import { GET as moveQuote } from "@/app/api/move/quote/route";
import { POST as driverScore } from "@/app/api/driver/score/route";
import { jsonError } from "@/lib/server/http";

// GET /api/mpp/challenge?product=underwriting|move-quote[&side=&amount=][&borrower=&profile=&platform=]
// → the REAL 402 that endpoint answers to an unpaid call, made server-side and returned as 200 JSON
//   { status, wwwAuthenticate, body }. UI pages show the live challenge without the browser logging a
//   red "402 Payment Required" in devtools. Nothing is charged: no credential is ever sent.
export async function GET(request: Request) {
  const u = new URL(request.url);
  const product = u.searchParams.get("product");
  let res: Response;
  if (product === "move-quote") {
    const side = u.searchParams.get("side") ?? "usd_to_mxn";
    const amount = u.searchParams.get("amount") ?? "250";
    const q = new URLSearchParams({ side, amount, access: "partner" });
    res = await moveQuote(new Request(`${u.origin}/api/move/quote?${q}`));
  } else if (product === "underwriting") {
    const body = {
      borrower: u.searchParams.get("borrower") ?? "",
      profile: u.searchParams.get("profile") ?? "steady",
      platform: u.searchParams.get("platform") ?? "uber",
    };
    res = await driverScore(
      new Request(`${u.origin}/api/driver/score?access=underwriter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  } else return jsonError(400, "Use ?product=underwriting|move-quote", "VALIDATION");

  return Response.json(
    {
      status: res.status,
      wwwAuthenticate: res.headers.get("WWW-Authenticate"),
      body: await res.json().catch(() => null),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
