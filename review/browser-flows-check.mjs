// Browser checks are read-only except creating unpaid quotes and requesting an eligibility report.
// No Pay, Draw, Supply, Swap or other broadcast button is clicked.
import fs from 'node:fs';import {chromium} from 'playwright';
const stamp=Date.now(), e={at:new Date().toISOString(),checks:[],flow:[]};
const b=await chromium.launch({headless:true});
try{
 const c=await b.newContext({viewport:{width:1440,height:1000}});let p;const errors=[];
 for(const path of ['/','/mint','/send','/credit','/pay','/earn']){
  p=await c.newPage();p.on('pageerror',x=>errors.push(x.message));
  try{const r=await p.goto('http://localhost:3100'+path,{waitUntil:'domcontentloaded',timeout:20000});await p.waitForTimeout(1800);e.checks.push({path,status:r.status(),errors:errors.splice(0),...await p.evaluate(()=>({text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth}))});await p.screenshot({path:`review/evidence/screen-${path.slice(1)||'home'}-${stamp}.png`,fullPage:true});}catch(x){e.checks.push({path,error:x.message.slice(0,600)});}finally{await p.close();}
 }
 p=await c.newPage();
 try{
  await p.goto('http://localhost:3100/pay',{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'Get quote',exact:true}).click();await p.getByText('Checkout',{exact:true}).waitFor({timeout:10000});
  e.flow.push({name:'quote-rendered',pass:true});
  await p.getByRole('textbox').first().fill('5512345679');e.flow.push({name:'phone-edit-drops-checkout',pass:await p.getByText('Checkout',{exact:true}).count()===0});
  await p.getByRole('button',{name:'Get quote',exact:true}).click();await p.getByText('Checkout',{exact:true}).waitFor({timeout:10000});await p.getByRole('button',{name:'$200',exact:true}).click();e.flow.push({name:'amount-edit-drops-checkout',pass:await p.getByText('Checkout',{exact:true}).count()===0});
  await p.getByRole('button',{name:'Connect',exact:true}).first().click();await p.getByRole('dialog').waitFor();e.walletOptions=await p.getByRole('dialog').innerText();await p.getByRole('button',{name:/Driver.*Demo Uber Data|Driver.*advance|Diego|Sofía/}).count().then(n=>e.flow.push({name:'driver-button-matches',count:n}));
  e.walletButtons=await p.getByRole('dialog').getByRole('button').allTextContents();await p.keyboard.press('Escape');
 }catch(x){e.flow.push({error:x.message.slice(0,1000)});}
 await c.close();const cm=await b.newContext({viewport:{width:390,height:844}});const pm=await cm.newPage();await pm.goto('http://localhost:3100/pay',{waitUntil:'domcontentloaded'});await pm.waitForTimeout(1200);e.mobile=await pm.evaluate(()=>({text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth,note:[...document.querySelectorAll('[role=note] p')].map(x=>({text:x.innerText,clipped:x.scrollWidth>x.clientWidth,width:x.clientWidth,scroll:x.scrollWidth}))}));await pm.screenshot({path:`review/evidence/screen-mobile-${stamp}.png`,fullPage:true});
}catch(x){e.error=x.message.slice(0,1000);}finally{await b.close();const file=`review/evidence/browser-flows-${stamp}.json`;fs.writeFileSync(file,JSON.stringify(e,null,2)+'\n');console.log(JSON.stringify({file,checks:e.checks.map(({path,status,error,errors,overflow})=>({path,status,error,errors,overflow})),flow:e.flow,walletButtons:e.walletButtons,mobile:e.mobile&&{overflow:e.mobile.overflow,note:e.mobile.note},error:e.error},null,2));}
