import fs from 'node:fs';
import {chromium} from 'playwright';
const widthArg=Number(process.argv[2]||1440),themeArg=process.argv[3]||'light'; const dir=`review/v6-recheck-evidence/stills/${widthArg}-${themeArg}`;fs.mkdirSync(dir,{recursive:true});
const routes=['/','/mint','/remesas','/global','/invest','/developers','/contracts'];
const report={started:new Date().toISOString(),cases:[]};
const browser=await chromium.launch({headless:true});
try {
 for (const [width,height] of [[widthArg,widthArg===1440?900:844]]) for(const theme of [themeArg]) for(const present of [false]) {
  const context=await browser.newContext({viewport:{width,height},colorScheme:theme,reducedMotion:'no-preference'});
  await context.addInitScript(({theme})=>localStorage.setItem('mercado.theme',theme),{theme});
  const page=await context.newPage();
  for(const route of routes){
   const id=`${width}-${theme}-${present?'present':'normal'}-${route.slice(1)||'home'}`;
   const row={id,route,width,height,theme,present,errors:[],httpErrors:[],failed:[],navs:0};
   const error=e=>row.errors.push(e.message); const response=r=>{if(r.status()>=400)row.httpErrors.push({status:r.status(),url:r.url().replace(/\?.*/,'' )})};
   const failed=r=>row.failed.push({url:r.url().replace(/\?.*/,''),error:r.failure()?.errorText});const nav=f=>{if(f===page.mainFrame())row.navs++};
   page.on('pageerror',error);page.on('response',response);page.on('requestfailed',failed);page.on('framenavigated',nav);
   try {
    const t=Date.now();const res=await page.goto('http://localhost:3100'+route+(present?'?present=1':'?present=0'),{waitUntil:'domcontentloaded',timeout:25000}); row.status=res.status();row.domMs=Date.now()-t;
    await page.locator('main').waitFor({timeout:18000}).catch(()=>{});
    await page.waitForTimeout(1900);row.captureMs=Date.now()-t;
    row.dom=await page.evaluate(()=>{
     const visible=e=>e.checkVisibility?.({checkVisibilityCSS:true,checkOpacity:true})&&e.getBoundingClientRect().width>0;
     const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
     const headings=[...document.querySelectorAll('h1,h2,h3')].filter(visible).map(e=>({text:e.innerText,...rect(e)}));
     const buttons=[...document.querySelectorAll('button,[role=tab],input,select')].filter(visible).map(e=>({tag:e.tagName,role:e.getAttribute('role'),text:(e.innerText||e.getAttribute('aria-label')||e.getAttribute('placeholder')||'').slice(0,100),disabled:e.disabled,...rect(e)}));
     const overflow=[...document.querySelectorAll('main *')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.left < -1||r.right>innerWidth+1}).slice(0,15).map(e=>({tag:e.tagName,text:(e.innerText||'').slice(0,90),...rect(e)}));
     const nav=[...document.querySelectorAll('nav')].filter(visible).map(e=>({name:e.getAttribute('aria-label'),class:e.className,text:e.innerText,...rect(e),transform:getComputedStyle(e).transform}));
     const phone=[...document.querySelectorAll('.m-root')].map(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,theme:e.getAttribute('data-theme')}));
     const current=[...document.querySelectorAll('[aria-current="page"]')].filter(visible).map(e=>({text:e.innerText,href:e.getAttribute('href')}));
     const headingsAX=[...document.querySelectorAll('h1,h2')].filter(visible).map(e=>({text:e.textContent,displayText:e.innerText,size:getComputedStyle(e).fontSize}));
     return {nav,phone,current,headingsAX,motion:matchMedia('(prefers-reduced-motion: reduce)').matches, animations:document.getAnimations().map(a=>({state:a.playState,name:a.animationName,duration:a.effect?.getTiming()?.duration,iterations:String(a.effect?.getTiming()?.iterations)})), footer:[...document.querySelectorAll('footer')].map(rect), title:document.title,text:document.body.innerText,width:document.documentElement.scrollWidth,headings,buttons,overflow,images:[...document.images].map(e=>({src:e.getAttribute('src'),loaded:e.complete&&e.naturalWidth>0})),honesty:[...document.querySelectorAll('[data-honesty]')].map(e=>({text:e.textContent,visible:visible(e)})),theme:document.documentElement.className};
    });
    row.screenshot=`${dir}/${id}.png`;await page.screenshot({path:row.screenshot});
    if(!present) {row.fullScreenshot=`${dir}/${id}-full.png`;await page.screenshot({path:row.fullScreenshot,fullPage:true});}
   }catch(e){row.failure=e.message;}
   finally {page.off('pageerror',error);page.off('response',response);page.off('requestfailed',failed);page.off('framenavigated',nav);report.cases.push(row);fs.writeFileSync(`${dir}/browser-matrix.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({id,status:row.status,ms:row.captureMs,errors:row.errors.length,http:row.httpErrors.length,navs:row.navs,overflow:row.dom?.width>width,failure:row.failure}));}
  }await context.close();
 }
}finally{await browser.close();report.finished=new Date().toISOString();fs.writeFileSync(`${dir}/browser-matrix.json`,JSON.stringify(report,null,2));}
