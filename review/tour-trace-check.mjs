import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as viem from 'viem';
import {createHash} from 'node:crypto';

const source=fs.readFileSync('apps/web/components/tour/demo-tour.tsx','utf8');
const d=JSON.parse(fs.readFileSync('packages/shared/src/deployments/42431.json','utf8'));
const who='0x1111111111111111111111111111111111111111', cp='0x2222222222222222222222222222222222222222';
const log=(n,from,to,amount)=>({address:d.v2.xMXN,blockNumber:BigInt(n),transactionHash:viem.toHex(n,{size:32}),args:{from,to,amount},logIndex:0});
const logs=[log(100,cp,who,3n),log(110,cp,who,100n),log(130,who,cp,50n)];
const requests=[],balanceRequests=[];
const client={getBlockNumber:async()=>100n,getLogs:async q=>{requests.push(q);return logs.filter(l=>l.blockNumber>=q.fromBlock&&(q.toBlock==='latest'||l.blockNumber<=q.toBlock)&&(!q.args.from||q.args.from===l.args.from)&&(!q.args.to||q.args.to===l.args.to));}};
const jsx=(type,props)=>({type,props});
const react={createContext:()=>({Provider:'Provider'}),useCallback:f=>f,useMemo:f=>f(),useEffect:()=>{},useState:x=>[x,()=>{}]};
const deps={react,'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'Link'},'next/navigation':{useRouter:()=>({push:()=>{}})},wagmi:{useConfig:()=>({}),usePublicClient:()=>client},'wagmi/actions':{readContract:async(_c,q)=>{balanceRequests.push(q);return 100n;}},'@tanstack/react-query':{useQuery:q=>q},viem,'lucide-react':{},sonner:{toast:{error:()=>{},warning:()=>{}}},'@mercado/shared':{explorerTx:h=>'https://explore.tempo.xyz/tx/'+h},'@/lib/contracts':{ADDR:{xmxn:d.v2.xMXN,ousd:d.ousd},CHAIN_ID:42431,tokenAbi:[]},'@/lib/busy':{useAnyBusy:()=>false},'@/lib/format':{fmtAmount:String,shortAddr:x=>x},'@/lib/utils':{cn:(...x)=>x.join(' ')},'@/components/ui/button':{},'@/components/console/products':{PRODUCTS:[]},'@/components/console/demo-mode':{useDemoMode:()=>({on:true})},'@/components/wallet/personas':{personaById:()=>({address:who}),personaByAddress:()=>undefined}};
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(source+'\nexport { TraceList };',{compilerOptions:{target:99,module:1,jsx:4}}).outputText,{module:m,exports:m.exports,require:n=>{if(!(n in deps))throw Error('missing adapter '+n);return deps[n];}});
const credit=await m.exports.useTrace(who,'100').queryFn();
const card=await m.exports.useTrace(who,'120').queryFn();
await m.exports.TourProvider({children:null}).props.value.go(0);
const rendered=m.exports.TraceList({rows:Array.from({length:7},(_,i)=>({...credit[0],hash:viem.toHex(i,{size:32})})),empty:''});
const tests=[
 {name:'snapshot-block-excluded-from-step',pass:!credit.some(r=>r.block===100n)},
 {name:'later-card-payment-not-attributed-to-credit',pass:!credit.some(a=>card.some(b=>a.hash===b.hash))},
 {name:'balance-snapshots-pinned-to-recorded-block',pass:balanceRequests.length===2&&balanceRequests.every(q=>q.blockNumber===100n)},
 {name:'whole-trail-renders-seven-transfer-rows',pass:rendered.props.children.length===7,rendered:rendered.props.children.length},
];
const evidence={at:new Date().toISOString(),sourceHash:createHash('sha256').update(source).digest('hex'),mode:'Actual Tour module with local block/log adapters. No browser or chain mutations.',tests,requests,balanceRequests,credit,card};
const file=`review/evidence/tour-trace-${Date.now()}.json`;
fs.writeFileSync(file,JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify({file,tests}));
