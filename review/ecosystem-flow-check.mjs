import fs from 'node:fs';import {chromium} from 'playwright';
const stamp=Date.now(),out={at:new Date().toISOString(),overflow:[],flow:[]},b=await chromium.launch({headless:true});
try {
 const c=await b.newContext({viewport:{width:390,height:844}});
 for(const route of ['/','/mint','/remesas','/credito?tab=drivers','/credito?tab=lenders']) {
  const p=await c.newPage();await p.goto('http://localhost:3100'+route,{waitUntil:'domcontentloaded'});await p.waitForTimeout(1200);
  const nodes=await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+2&&!e.closest('[role="tablist"]');}).map(e=>({tag:e.tagName,text:e.innerText?.slice(0,90),class:e.className,right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width)})).filter(e=>e.tag!=='SCRIPT').slice(-22));
  out.overflow.push({route,scrollWidth:await p.evaluate(()=>document.documentElement.scrollWidth),nodes});await p.close();
 }
 await c.close();
 const d=await b.newContext({viewport:{width:1440,height:1000}}),p=await d.newPage();await p.goto('http://localhost:3100/',{waitUntil:'domcontentloaded'});await p.waitForTimeout(500);
 const tile=p.locator('a[href="/mint"]').filter({hasText:'OUSD'}).first();await tile.focus();await p.keyboard.press('ArrowRight');out.flow.push({name:'home-tile-arrow-right',href:await p.evaluate(()=>document.activeElement?.getAttribute('href'))});await p.keyboard.press('Enter');await p.waitForURL('**/remesas');
 await p.getByRole('button',{name:/Recargar Tiempo Aire/}).click();await p.locator('input[placeholder="55 1234 5678"]:visible').fill('5512345678');await p.getByRole('button',{name:/Cotizar/}).click();await p.getByRole('button',{name:/Pagar .* xMXN/}).waitFor({timeout:15000});
 out.flow.push({name:'unpaid-airtime-quote',url:p.url(),text:(await p.locator('body').innerText())});await p.reload({waitUntil:'domcontentloaded'});await p.waitForTimeout(1000);out.flow.push({name:'reload-recovery-controls',buttons:await p.getByRole('button').allTextContents(),savedKeys:await p.evaluate(()=>JSON.parse(localStorage.getItem('mercado.bill-orders')||'[]').length)});
 await d.close();
}catch(e){out.error=e.message.slice(0,800);}finally{await b.close();const file=`review/evidence/ecosystem-flow-${stamp}.json`;fs.writeFileSync(file,JSON.stringify(out,null,2));console.log(JSON.stringify({file,overflow:out.overflow.map(({route,scrollWidth})=>({route,scrollWidth})),flow:out.flow.map(({text,...x})=>x),error:out.error}));}
