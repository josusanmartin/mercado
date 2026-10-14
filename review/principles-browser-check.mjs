import fs from 'node:fs';
import {chromium} from 'playwright';
const stamp=Date.now(),e={at:new Date().toISOString(),pages:[]};
const b=await chromium.launch();
try {
 for(const width of [390,1440]) {
  const c=await b.newContext({viewport:{width,height:1000}});
  for(const route of ['/','/remesas','/credito','/card?holder=driver','/invest','/contracts']) {
   const p=await c.newPage(),errors=[];p.on('pageerror',x=>errors.push(x.message));
   try {
    const r=await p.goto('http://localhost:3100'+route,{waitUntil:'domcontentloaded',timeout:25000});
    await p.waitForTimeout(2200);
    const info=await p.evaluate(()=>{
     const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
     const rgba=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((x,i)=>i===3?x/255:x);};
     const blend=(front,back)=>[...front.slice(0,3).map((v,i)=>v*front[3]+back[i]*(1-front[3])),1];
     const lum=c=>c.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
     const contrast=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
     const rows=[];
     for(const el of document.querySelectorAll('body *')) {
      if(!(el instanceof HTMLElement)||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
      const own=[...el.childNodes].filter(x=>x.nodeType===Node.TEXT_NODE).map(x=>x.textContent).join(' ').replace(/\s+/g,' ').trim();
      if(!own)continue;
      const css=getComputedStyle(el),rect=el.getBoundingClientRect();if(!rect.width||!rect.height)continue;
      const chain=[];let unsupported=false,opacity=1,clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
      for(let a=el;a;a=a.parentElement){const s=getComputedStyle(a);chain.unshift(s.backgroundColor);if(s.backgroundImage!=='none')unsupported=true;opacity*=Number(s.opacity);if(a!==el&&/(hidden|clip|scroll|auto)/.test(s.overflow+s.overflowX+s.overflowY)){const ar=a.getBoundingClientRect();clip={left:Math.max(clip.left,ar.left),right:Math.min(clip.right,ar.right),top:Math.max(clip.top,ar.top),bottom:Math.min(clip.bottom,ar.bottom)};}}
      let bg=[255,255,255,1];for(const color of chain)bg=blend(rgba(color),bg);
      const fg=blend(rgba(css.color),bg),ratio=contrast(fg,bg),size=parseFloat(css.fontSize),weight=parseInt(css.fontWeight)||400;
      const large=size>=24||(size>=18.6666667&&weight>=700),required=large?3:4.5;
      const visible=rect.right>clip.left&&rect.left<clip.right&&rect.bottom>clip.top&&rect.top<clip.bottom;
      const disabled=!!el.closest(':disabled,[aria-disabled="true"]');
      const phone=!!el.closest('.m-root');
      rows.push({text:own.slice(0,180),tag:el.tagName,phone,size,weight,color:css.color,bg:bg.slice(0,3),ratio,required,fail:!unsupported&&opacity===1&&!disabled&&ratio<required,unsupported,opacity,visible,disabled,clippedX:rect.left<clip.left-1||rect.right>clip.right+1,class:el.className,rect:{x:rect.x,y:rect.y,w:rect.width,h:rect.height}});
     }
     return {scrollWidth:document.documentElement.scrollWidth,text:document.body.innerText,rows};
    });
    const file=`review/evidence/principles-${stamp}-${width}-${route.split('?')[0].slice(1)||'home'}.png`;
    await p.screenshot({path:file,fullPage:true});
    e.pages.push({route,width,status:r.status(),errors,screenshot:file,...info});
   } catch(err){e.pages.push({route,width,error:err.message,errors});}finally{await p.close();}
  }await c.close();
 }
} finally {await b.close();const file=`review/evidence/principles-${stamp}.json`;fs.writeFileSync(file,JSON.stringify(e,null,2));console.log(JSON.stringify({file,pages:e.pages.map(p=>({route:p.route,width:p.width,status:p.status,errors:p.errors,error:p.error,scrollWidth:p.scrollWidth,contrastFailures:p.rows?.filter(r=>r.fail&&r.visible).map(({text,color,ratio,phone})=>({text,color,ratio,phone})),phoneLabels:p.rows?.filter(r=>r.phone&&/testnet|sin valor|simulad|demo/i.test(r.text)).map(({text,visible,ratio,clippedX})=>({text,visible,ratio,clippedX}))}))}));}
