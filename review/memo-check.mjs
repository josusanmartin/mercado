// Actual actions module with an isolated transaction adapter. No chain writes or keys.
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import * as viem from 'viem';import {createHash} from 'node:crypto';
const file='apps/web/lib/contracts/actions.ts',source=fs.readFileSync(file,'utf8');
const d=JSON.parse(fs.readFileSync('packages/shared/src/deployments/42431.json','utf8'));
let writes=[];
const tx={run:async f=>{try{await f({account:d.merchant,write:async req=>{writes.push({functionName:req.functionName,args:req.args});return {receipt:{logs:[]}}}});return true;}catch(e){return {error:e.message};}}};
const deps={react:{useCallback:f=>f},viem,wagmi:{useConfig:()=>({})},'wagmi/actions':{readContract:async()=>viem.maxUint256},'./addresses':{ADDR:{...d,xmxn:d.xMXN},CHAIN_ID:42431},'./abis':{tokenAbi:[],swapDeskAbi:[],creditPoolAbi:[],vaultAbi:[]},'./tx':{useTx:()=>tx}};
const m={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:99,module:1}}).outputText,{module:m,exports:m.exports,require:n=>deps[n],TextEncoder,BigInt});
const results=[];for(const memo of ['para mamá','a'.repeat(32),'é'.repeat(16),'é'.repeat(17)]){writes=[];const result=await m.exports.useMercado().swapAndSend(1000000n,19900000n,d.merchant,memo);results.push({memo,utf8Length:new TextEncoder().encode(memo).length,result,writes});}
const e={at:new Date().toISOString(),mode:'local actual actions orchestration, fake receipt/write adapter',sourceSha256:createHash('sha256').update(source).digest('hex'),results};const out=`review/evidence/memo-${Date.now()}.json`;fs.writeFileSync(out,JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');console.log(JSON.stringify({file:out,results:results.map(r=>({utf8Length:r.utf8Length,result:r.result,writes:r.writes.map(w=>w.functionName)}))},null,2));
