// Dev-server warmup (judge rehearsal): Next compiles each route on its first request, so a judge opening a
// freshly restarted :3100 would wait seconds per page, and the Demo Tour would stall between steps. Once the
// server answers, request every page and the cheap GET APIs once, in sequence, in the background: routes get
// compiled and the server-side caches (FX, sponsor policy, MPP pricing, Invest rates, demo driver data) fill.
// Dev only; set MERCADO_NO_WARM=1 to skip.
const PAGES = ["/", "/mint", "/remesas", "/global", "/credito", "/card", "/invest", "/developers", "/contracts"];
const APIS = ["/api/fx", "/api/sponsor", "/api/mpp/pricing", "/api/invest/rates", "/api/driver/demo?profile=steady", "/api/onramp"];

async function warm(base: string) {
  const until = Date.now() + 120_000;
  for (;;) {
    const up = await fetch(`${base}/api/fx`).then(() => true, () => false);
    if (up) break;
    if (Date.now() > until) return console.warn("[warm] server never answered; skipped");
    await new Promise((r) => setTimeout(r, 1_000));
  }
  const t0 = Date.now();
  const timings: string[] = [];
  for (const path of [...PAGES, ...APIS]) {
    const t = Date.now();
    const status = await fetch(base + path).then((r) => r.status, () => 0);
    timings.push(`${path} ${status} ${Date.now() - t}ms`);
  }
  console.log(`[warm] ${PAGES.length} pages + ${APIS.length} APIs ready in ${Date.now() - t0}ms\n  ${timings.join("\n  ")}`);
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development" || process.env.MERCADO_NO_WARM === "1") return;
  void warm(`http://localhost:${process.env.PORT ?? "3100"}`);
}
