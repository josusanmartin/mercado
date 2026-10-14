import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const base of ["http://localhost:3100", "http://localhost:3101"]) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`${base}/mint`, { waitUntil: "load" });
  await p.waitForTimeout(6000);
  const out = [];
  for (const t of ["Overview", "Issue", "Your positions", "Activity"]) {
    await p.locator(`text=${t}`).first().click().catch(() => {});
    await p.waitForTimeout(2500);
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    const wide = await p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > 392 && getComputedStyle(e).position !== "fixed").slice(0, 3).map((e) => `${e.tagName}.${(e.className?.baseVal ?? e.className ?? "").toString().slice(0, 60)}`));
    out.push(`${t}:${w}${w > 390 ? " " + JSON.stringify(wide) : ""}`);
  }
  console.log(base, out.join(" | "));
  await p.screenshot({ path: `/tmp/claude-1000/-home-josu-dev-mercado/77f5cf4b-75c3-4bdb-8077-5ea651c3331d/scratchpad/shots/mint-390-${base.slice(-4)}.png`, fullPage: true });
}
await b.close();
