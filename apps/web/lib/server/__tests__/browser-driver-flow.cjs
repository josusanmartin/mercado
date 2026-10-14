// Browser check of the driver flow on :3100 (Playwright, demo persona). Moves real testnet xMXN.
// Usage: node apps/web/lib/server/__tests__/browser-driver-flow.cjs Javier   (SKIP_DRAW=1 to only pay)
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
    await p.goto("http://localhost:3100/credit", { waitUntil: "domcontentloaded", timeout: 90000 }); await p.getByText("Steady driver").waitFor({ timeout: 90000 });
    await step("connect driver", async () => {
      await p.waitForTimeout(4000);
      await p.getByRole("button", { name: new RegExp("^" + (process.argv[2] || "Javier")) }).first().click({ timeout: 60000 });
      await p.getByRole("button", { name: /\(active\)/ }).first().waitFor({ timeout: 60000 });
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
      await p.getByText(/Draw advance ✓/).waitFor({ timeout: 60000 });
    });
    await p.waitForTimeout(6000);
    await p.screenshot({ path: S + "e2e-credit.png", fullPage: true });
    }
    await step("pay page quote", async () => {
      await p.goto("http://localhost:3100/pay", { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(4000);
      if (!(await p.getByRole("button", { name: /\(active\)/ }).count()))
        await p.getByRole("button", { name: new RegExp("^" + (process.argv[2] || "Javier")) }).first().click({ timeout: 60000 });
      await p.getByRole("button", { name: /\(active\)/ }).first().waitFor({ timeout: 60000 });
      await p.getByRole("button", { name: "$20", exact: true }).click();
      await p.getByRole("button", { name: "Get quote" }).click();
      await p.getByRole("heading", { name: "Checkout" }).waitFor();
    });
    await step("pay", async () => {
      await p.waitForTimeout(3000);
      await p.getByRole("button", { name: /^Pay 20/ }).click();
      await p.getByText("Reference", { exact: true }).waitFor({ timeout: 90000 });
    });
    await p.waitForTimeout(4000);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: S + "e2e-pay.png", fullPage: false });
  } finally {
    console.log("errors:\n" + errs.slice(0, 10).join("\n"));
    await b.close();
  }
})();
