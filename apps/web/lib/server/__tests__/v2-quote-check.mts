// Read-only check of MOVE quotes against the deployed v2 vAMM, with the protocol forced to v2 for THIS
// process only (the app stays on v1 until lead flips). Usage: npx tsx apps/web/lib/server/__tests__/v2-quote-check.mts
process.env.NEXT_PUBLIC_PROTOCOL = "v2";
const { quoteMove, MoveQuoteError } = await import("../move/quote");
const { activeProtocol } = await import("../protocol");
console.log("active", activeProtocol());
for (const [side, amount] of [["usd_to_mxn", "100"], ["usd_to_mxn", "2000"], ["mxn_to_usd", "1000"], ["mxn_to_usd", "20000"], ["usd_to_mxn", "1000000"]] as const) {
  try {
    const q = await quoteMove(side, amount);
    console.log(side, amount, "→", q.source, q.protocol, `out ${Number(q.amountOut) / 1e6} ${q.symbolOut}`, `rate ${q.rate.toFixed(4)}`, `mid ${q.oracleMidRate}`, `spread ${q.effectiveSpreadBps}bps fee ${q.feeBps} impact ${q.sizeImpactBps}`, `tokenOut ${q.tokenOut.slice(0, 10)}`);
  } catch (e) {
    console.log(side, amount, "→", e instanceof MoveQuoteError ? `${e.status} ${e.code}: ${e.message}` : String(e).slice(0, 200));
  }
}
