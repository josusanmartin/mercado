import fs from 'node:fs';import {chromium} from 'playwright';
const dir='review/v5-recheck-evidence/final-motion';fs.mkdirSync(dir,{recursive:true});
const b=await chromium.launch();const out={at:new Date().toISOString(),scope:'Cold route and read-only quotes only; no payment clicks',runs:[]};
for(const [width,height] of [[1440,900],[390,844]])for(const theme of ['light','dark']){
 const id=`${width}-${theme}`;const c=await b.newContext({viewport:{width,height},colorScheme:theme,recordVideo:{dir:dir+'/raw',size:{width,height}}});await c.addInitScript(t=>localStorage.setItem('mercado.theme',t),theme);const p=await c.newPage(),video=p.video();const r={id,errors:[]};p.on('pageerror',e=>r.errors.push(e.message));
 await p.route('**/api/move/quote?**',async route=>{await new Promise(resolve=>setTimeout(resolve,1300));await route.continue().catch(()=>{})});
 await p.goto('http://localhost:3100/');await p.waitForTimeout(800);const link=p.locator('main a[href="/global"]').first();await link.scrollIntoViewIfNeeded();
 await p.evaluate(()=>{window.__lastTaste=[];const t=performance.now();const sample=now=>{const e=[...document.querySelectorAll('button')].find(e=>/^(Pay supplier|Pay [\d])/.test(e.textContent));if(e&&location.pathname==='/global'){const r=e.getBoundingClientRect();window.__lastTaste.push({ms:now-t,y:r.y+scrollY,width:r.width,height:r.height,text:e.textContent,routeTransform:getComputedStyle(document.querySelector('.mx-enter')).transform})}if(now-t<3700)requestAnimationFrame(sample)};requestAnimationFrame(sample)});
 await link.click();await p.waitForTimeout(3800);r.samples=await p.evaluate(()=>window.__lastTaste);await p.screenshot({path:`${dir}/${id}-settled.png`});
 await p.getByLabel('You pay (OUSD)',{exact:true}).fill('1,0,00');await p.waitForTimeout(250);r.invalid=await p.locator('main').innerText();await p.screenshot({path:`${dir}/${id}-invalid.png`});
 await p.getByLabel('You pay (OUSD)',{exact:true}).fill('1,000');await p.waitForTimeout(1700);r.grouped=await p.locator('main').innerText();await p.screenshot({path:`${dir}/${id}-grouped.png`});
 await c.close();r.video=`${dir}/${id}.webm`;await video.saveAs(r.video);out.runs.push(r);fs.writeFileSync(`${dir}/inspection.json`,JSON.stringify(out,null,2));console.log(JSON.stringify({id,errors:r.errors,ys:[...new Set(r.samples.filter(x=>x.routeTransform==='none').map(x=>Math.round(x.y*10)/10))],widths:[...new Set(r.samples.map(x=>Math.round(x.width)))],heights:[...new Set(r.samples.map(x=>x.height))]}));
}await b.close();
