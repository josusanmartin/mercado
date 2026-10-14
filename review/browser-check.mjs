import { chromium } from 'playwright';
import fs from 'node:fs';
const stamp=Date.now(),e={at:new Date().toISOString(),checks:[]};
const browser=await chromium.launch({headless:true});
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  for(const path of ['/','/mint','/send','/credit','/pay','/earn']){
   const errors=[];const handler=x=>errors.push(x.message);page.on('pageerror',handler);
   try{
    const response=await page.goto('http://localhost:3100'+path,{waitUntil:'networkidle',timeout:25000});
    const result=await page.evaluate(()=>({title:document.title,text:document.body.innerText.slice(0,8000),scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
    e.checks.push({name,path,status:response.status(),...result,errors});
    if(path==='/')await page.screenshot({path:`review/evidence/browser-${name}-${stamp}.png`,fullPage:true});
   }catch(x){e.checks.push({name,path,error:x.message});}
   page.off('pageerror',handler);
  }
  await context.close();
 }
}finally{await browser.close();}
const file=`review/evidence/browser-${stamp}.json`;fs.writeFileSync(file,JSON.stringify(e,null,2)+'\n');
console.log(JSON.stringify({file,checks:e.checks.map(({name,path,status,error,errors,title})=>({name,path,status,error,errors,title}))},null,2));
