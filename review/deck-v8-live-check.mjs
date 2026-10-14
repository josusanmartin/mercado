import fs from 'node:fs';
import {chromium} from 'playwright';
const dir='review/deck-v8-evidence/live';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:900},colorScheme:'dark',reducedMotion:'reduce'});
await context.addInitScript(()=>localStorage.setItem('mercado.theme','dark'));
const page=await context.newPage(),results=[];
try{for(const route of ['/','/mint','/remesas','/global','/invest','/developers','/contracts']){
const key=route.slice(1)||'home',errors=[];const onerr=e=>errors.push(e.message);page.on('pageerror',onerr);
const res=await page.goto(`http://localhost:3100${route}?present=0`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
const data={route,at:new Date().toISOString(),status:res.status(),errors,text:await page.locator('body').innerText()};
await page.screenshot({path:`${dir}/${key}.png`,fullPage:true});
if(route==='/mint') {const risk=page.getByRole('tab',{name:/Risk/i}); if(await risk.count()){await risk.click();await page.waitForTimeout(700);data.risk=await page.locator('main').innerText();await page.screenshot({path:`${dir}/mint-risk.png`,fullPage:true});}}
fs.writeFileSync(`${dir}/${key}.json`,JSON.stringify(data,null,2));results.push({route,status:data.status,errors});console.log(JSON.stringify(results.at(-1)));page.off('pageerror',onerr);
}}finally{await browser.close();fs.writeFileSync(`${dir}/summary.json`,JSON.stringify({at:new Date().toISOString(),scope:'Direct read-only navigation; no Card/Credito flows, transactions, paid API calls, or signatures.',results},null,2));}
