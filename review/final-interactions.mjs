import fs from 'node:fs';import {chromium} from 'playwright';
const dir='review/final-evidence';const report={at:new Date().toISOString(),states:[],errors:[],http:[]};const browser=await chromium.launch();
for(const [width,height] of [[1440,900],[390,844]]){
 const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});const p=await ctx.newPage();p.setDefaultTimeout(5000);
 p.on('pageerror',e=>report.errors.push({width,url:p.url(),error:e.message}));p.on('response',async r=>{if(r.status()>=400&&r.status()!==402)report.http.push({width,url:r.url().replace(/\?.*/,''),status:r.status(),body:(await r.text().catch(()=>'' )).slice(0,350)})});
 const snap=async id=>{await p.waitForTimeout(700);const row={id:`${width}-${id}`,url:p.url(),width};row.dom=await p.evaluate(()=>({text:document.body.innerText,buttons:[...document.querySelectorAll('button,input,[role=dialog]')].filter(e=>e.checkVisibility?.()).map(e=>({tag:e.tagName,text:(e.innerText||e.getAttribute('aria-label')||e.getAttribute('placeholder')||'').slice(0,100),role:e.getAttribute('role'),disabled:e.disabled})),focus:{tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,150),inDialog:!!document.activeElement?.closest('[role=dialog]')},width:document.documentElement.scrollWidth}));row.screenshot=`${dir}/interaction-${row.id}.png`;await p.screenshot({path:row.screenshot});report.states.push(row);fs.writeFileSync(`${dir}/interactions.json`,JSON.stringify(report,null,2));};
 const step=async(id,fn)=>{try{await fn();await snap(id)}catch(e){report.states.push({id:`${width}-${id}`,error:e.message});fs.writeFileSync(`${dir}/interactions.json`,JSON.stringify(report,null,2));}};
 const go=async route=>{await p.goto('http://localhost:3100'+route,{waitUntil:'domcontentloaded'});await p.waitForTimeout(2500)};
 const click=async(name,scope=p)=>scope.getByRole('button',{name:typeof name==='string'?new RegExp('^'+name+'$','i'):name}).or(scope.getByRole('tab',{name:typeof name==='string'?new RegExp(name,'i'):name})).first().click();const phone=()=>p.locator('.m-root');
 await go('/mint?present=0');for(const label of [/ISSUE & MANAGE/i,/YOUR POSITIONS/i,/RISK/i,/^ACTIVITY$/i])await step('mint-'+label.source.replace(/[^a-z]/gi,''),()=>click(label));
 await go('/remesas?present=0');await step('remesas-add-disabled',()=>click('Agregar',phone()));
 await step('sheet-focus-after-shifttab',async()=>{await p.keyboard.press('Shift+Tab')});await p.keyboard.press('Escape');
 await step('remesas-send',()=>click('Enviar',phone()));
 await step('remesas-quote',async()=>{for(const n of ['5','0'])await click(n,phone());await click(/Continuar/i,phone())});await p.keyboard.press('Escape');
 await go('/remesas');await step('remesas-airtime',()=>click('Tiempo Aire',phone()));await go('/remesas');await step('remesas-services',()=>click('Servicios',phone()));await go('/remesas');for(const label of ['Actividad','Perfil'])await step('remesas-'+label,()=>click(label,phone()));
 await go('/global');for(const label of [/^REDEEM$/i,/EXCHANGE BACKING/i,/PARTNER API/i,/^ACTIVITY$/i])await step('global-'+label.source.replace(/[^a-z]/gi,''),()=>click(label));
 await go('/credito');await step('credito-consent',()=>click(/Continuar con Uber/i,phone()));await step('credito-home-connected',async()=>{await click('Permitir');await p.waitForTimeout(2000)});
 for(const label of ['Ganancias','Actividad','Perfil','Inicio'])await step('credito-'+label,()=>click(label,phone()));
 await step('credito-advance-sheet',()=>click(/Pedir adelanto|Pedir|Adelanto|Solicitar/i,phone()));await p.keyboard.press('Escape');
 await step('credito-backoffice',()=>click(/BACK OFFICE/i));
 await go('/card?holder=driver');await step('card-driver-state',async()=>{});for(const label of ['Actividad','Perfil','Tarjeta'])await step('card-'+label,()=>click(label,phone()));
 await step('card-limit-sheet',()=>click(/Límite diario/i,phone()));await p.keyboard.press('Escape');
 await go('/invest');await step('invest-save-sheet',()=>click('Ahorrar',phone()));await p.keyboard.press('Escape');await step('invest-withdraw-sheet',()=>click('Retirar',phone()));await p.keyboard.press('Escape');await step('invest-stock-sheet',()=>click('Acciones',phone()));await p.keyboard.press('Escape');for(const label of ['Actividad','Perfil'])await step('invest-'+label,()=>click(label,phone()));
 await go('/developers');for(const label of [/PARTNER FX QUOTE/i,/BILL PAY \(TIEMPO AIRE\)/i])await step('developers-'+label.source.replace(/[^a-z]/gi,''),()=>click(label));
 await go('/contracts');for(const label of [/LEGACY V1/i,/DEPLOYMENT HISTORY/i])await step('contracts-'+label.source.replace(/[^a-z]/gi,''),()=>click(label));
 await ctx.close();
}
await browser.close();fs.writeFileSync(`${dir}/interactions.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({states:report.states.length,errors:report.errors.length,failed:report.states.filter(s=>s.error).map(s=>({id:s.id,error:s.error.slice(0,130)})),http:report.http},null,2));
