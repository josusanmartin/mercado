import { chromium } from "@playwright/test";
const [out, route, ...tabs] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 300)));
await p.goto(`${process.env.BASE ?? "http://localhost:3100"}${route}`, { waitUntil: "load" });
await p.waitForTimeout(7000);
await p.screenshot({ path: `${out}/${route.slice(1)}-0.png`, fullPage: true });
let i = 1;
for (const t of tabs) {
  await p.getByRole("button", { name: new RegExp(`^${t}`) }).first().click().catch((e) => errs.push("click " + t));
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `${out}/${route.slice(1)}-${i++}.png`, fullPage: true });
}
console.log("pageerrors", JSON.stringify(errs));
await b.close();
