// Browser check of the driver flow on :3100 (Playwright, demo persona). Moves real testnet xMXN.
// Usage: node apps/web/lib/server/__tests__/browser-driver-flow.cjs   (Mercado Crédito → Drivers: score → draw)
const { chromium } = require("/home/josu/dev/mercado/node_modules/playwright");
const S = process.env.SHOTS_DIR ?? "/tmp/";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 300)));
  p.on("console", (m) => m.type() === "error" && errs.push("console " + m.text().slice(0, 300)));
  const step = async (name, fn) => { try { await fn(); console.log("ok", name); } catch (e) { console.log("FAIL", name, String(e).split("\n")[0]); await p.screenshot({ path: S + "fail.png", fullPage: true }); throw e; } };
  try {
    await p.goto("http://localhost:3100/credito?tab=drivers", { waitUntil: "domcontentloaded", timeout: 90000 }); await p.getByText("Steady driver").waitFor({ timeout: 90000 });
    await step("demo mode connects the Driver role", async () => {
      // Demo mode auto-connects the product's role account (Driver on /credito?tab=drivers).
      await p.getByText(/Driver\s*·\s*0x/).first().waitFor({ timeout: 60000 });
    });
    if (!process.env.SKIP_DRAW) {
    await step("pick steady", () => p.getByText("Steady driver").click());
    await step("check eligibility", async () => {
      await p.getByRole("button", { name: "Check eligibility" }).click();
      await p.getByText("Available now").waitFor({ timeout: 20000 });
    });
    await step("draw 50", async () => {
      await p.getByRole("button", { name: "Draw an advance" }).click();
      await p.getByPlaceholder("Amount in xMXN").fill("50");
      await p.getByRole("button", { name: "Draw advance" }).click();
      await p.getByText(/Advance received/).waitFor({ timeout: 90000 });
    });
    await p.waitForTimeout(6000);
    await p.screenshot({ path: S + "e2e-credit.png", fullPage: true });
    }
    // Paying bills is now Mercado Remesas (web's Android-framed app), covered by qa's ecosystem e2e.
  } finally {
    console.log("errors:\n" + errs.slice(0, 10).join("\n"));
    await b.close();
  }
})();
