const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  for (const [dark, q] of [[false, ''], [false, '?present=1'], [true, ''], [true, '?present=1']]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    if (dark) await ctx.addInitScript(() => { try { localStorage.setItem('mercado.theme', 'dark') } catch {} });
    const p = await ctx.newPage(); let navs = 0; const logs = [];
    p.on('framenavigated', f => { if (f === p.mainFrame()) navs++ });
    p.on('console', m => { if (/reload|hmr|fast refresh|full reload/i.test(m.text())) logs.push(m.text().slice(0, 120)) });
    await p.goto('http://localhost:3100/mint' + q, { waitUntil: 'domcontentloaded' }).catch(e => logs.push('goto ' + e.message.slice(0, 80)));
    await p.waitForTimeout(12000);
    console.log(`dark=${dark} q='${q}' navigations in 12s: ${navs}  ${logs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  await b.close();
})();
