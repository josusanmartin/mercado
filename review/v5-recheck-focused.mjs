import fs from 'node:fs';
import {chromium} from 'playwright';
const dir='review/v5-recheck-evidence/focused'; fs.mkdirSync(dir,{recursive:true});
const out={at:new Date().toISOString(),scope:'UI only; read-only quote delay in this browser; no transactions',cases:[]};
const b=await chromium.launch();
for(const [width,height] of [[1440,900],[390,844]]) {
 const c=await b.newContext({viewport:{width,height},colorScheme:'light'});
 await c.addInitScript(()=>localStorage.setItem('mercado.theme','light'));
 const p=await c.newPage(); const r={width,errors:[]}; p.on('pageerror',e=>r.errors.push(e.message));
 await p.goto('http://localhost:3100/'); await p.waitForTimeout(1500);
 if(width===390){
  const nav=p.getByRole('navigation',{name:'Console',exact:true});
  for(const name of ['Products','More']){
   await nav.getByRole('button',{name,exact:true}).click();await p.waitForTimeout(250);
   const focus=[];
   for(let i=0;i<10;i++){focus.push(await p.evaluate(()=>({text:document.activeElement?.textContent?.slice(0,90),tag:document.activeElement?.tagName,inDialog:!!document.activeElement?.closest('[role=dialog]')})));await p.keyboard.press('Tab')}
   r[name]={focus};await p.screenshot({path:`${dir}/${width}-${name.toLowerCase()}-focus.png`});
   await p.keyboard.press('Escape');await p.waitForTimeout(100);r[name].afterEscape=await p.evaluate(()=>({text:document.activeElement?.textContent?.slice(0,90),tag:document.activeElement?.tagName,dialogs:document.querySelectorAll('[role=dialog]').length}));
  }
 }
 await p.route('**/api/move/quote?**',async route=>{await new Promise(resolve=>setTimeout(resolve,1800));await route.continue().catch(()=>{})});
 await p.goto('http://localhost:3100/global');
 await p.getByLabel('You pay (OUSD)',{exact:true}).waitFor();
 const measure=()=>p.evaluate(()=>{const btn=[...document.querySelectorAll('button')].find(e=>/^(Pay supplier|Pay [\d])/.test(e.textContent));const rect=btn?.getBoundingClientRect();return {pay:btn?{text:btn.textContent,y:rect.y,height:rect.height,disabled:btn.disabled}:null,body:document.querySelector('main')?.innerText}});
 await p.waitForTimeout(400);r.loading=await measure();await p.screenshot({path:`${dir}/${width}-quote-loading.png`});
 await p.waitForTimeout(2800);r.loaded=await measure();await p.screenshot({path:`${dir}/${width}-quote-loaded.png`});
 await p.getByLabel('You pay (OUSD)',{exact:true}).fill('1000');await p.waitForTimeout(180);r.refresh=await measure();await p.screenshot({path:`${dir}/${width}-quote-refresh.png`});await p.waitForTimeout(2300);
 await p.getByLabel('You pay (OUSD)',{exact:true}).fill('1,000');await p.waitForTimeout(600);r.formattedAmount=await measure();await p.screenshot({path:`${dir}/${width}-formatted-amount.png`});
 await c.close();out.cases.push(r);fs.writeFileSync(`${dir}/inspection.json`,JSON.stringify(out,null,2));
}
await b.close();console.log(JSON.stringify(out.cases.map(r=>({width:r.width,errors:r.errors,loading:r.loading.pay,loaded:r.loaded.pay,refresh:r.refresh.pay,focus:r.Products?.focus}))));
