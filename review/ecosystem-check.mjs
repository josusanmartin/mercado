import fs from 'node:fs';import {chromium} from 'playwright';
const stamp=Date.now(),out={at:new Date().toISOString(),routes:[]};
const browser=await chromium.launch({headless:true});
try {
  for(const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:1000}});
    for(const route of ['/','/mint','/remesas','/global','/credito','/credit','/earn','/pay','/send']) {
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      try {
        const response=await page.goto('http://localhost:3100'+route,{waitUntil:'domcontentloaded',timeout:20000});
        await page.waitForTimeout(1500);
        const snap=await page.evaluate(()=>({text:document.body.innerText,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,headings:[...document.querySelectorAll('h1,h2')].map(e=>e.textContent),buttons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width).map(e=>({text:e.innerText,aria:e.getAttribute('aria-label'),disabled:e.disabled})),footer:[...document.querySelectorAll('footer')].map(e=>({text:e.innerText,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height}))}));
        out.routes.push({route,width,url:page.url(),status:response.status(),errors,...snap});
        if(['/','/remesas','/credito'].includes(route))await page.screenshot({path:`review/evidence/ecosystem-${stamp}-${width}-${route.slice(1)||'home'}.png`,fullPage:true});
      }catch(e){out.routes.push({route,width,error:e.message.slice(0,500),errors});}finally{await page.close();}
    }
    await context.close();
  }
}finally {
  await browser.close();const file=`review/evidence/ecosystem-${stamp}.json`;fs.writeFileSync(file,JSON.stringify(out,null,2));
  console.log(JSON.stringify({file,routes:out.routes.map(({route,width,url,status,scrollWidth,errors,error})=>({route,width,url,status,scrollWidth,errors,error}))}));
}
