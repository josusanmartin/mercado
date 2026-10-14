// Executes the actual useTx hook with minimal React/wagmi adapters. No wallets, network or broadcasts.
import ts from 'typescript';
import vm from 'node:vm';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const file='apps/web/lib/contracts/tx.ts',source=fs.readFileSync(file,'utf8');
const A=`0x${'11'.repeat(20)}`,B=`0x${'22'.repeat(20)}`;
let active=A,n=0;const writes=[];
const deps={
 react:{useCallback:fn=>fn,useRef:v=>({current:v}),useState:v=>[v,()=>{}]},
 wagmi:{useConfig:()=>({})},
 'wagmi/actions':{
  getConnection:()=>({address:active,chainId:42431,status:'connected'}),
  simulateContract:async(_config,request)=>({request}),
  writeContract:async(_config,request)=>{writes.push({account:request.account,functionName:request.functionName});return `0x${(++n).toString(16).padStart(64,'0')}`;},
  waitForTransactionReceipt:async()=>({status:'success'}),
 },
 '@tanstack/react-query':{useQueryClient:()=>({invalidateQueries:async()=>{}})},
 '@mercado/shared':{explorerTx:h=>`https://explore.testnet.tempo.xyz/tx/${h}`},
 './addresses':{CHAIN_ID:42431},'./errors':{readableError:e=>e.message},
};
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,require:n=>{if(!(n in deps))throw new Error('Unexpected dependency '+n);return deps[n]},console,Promise},{filename:file});
const tx=m.exports.useTx();
const result=await tx.run(async api=>{
 await api.write({address:A,abi:[],functionName:'swapOusdForXmxn'},'Swap as original sender');
 active=B; // connected wallet/persona changes between confirmed steps
 await api.write({address:A,abi:[],functionName:'transfer'},'Send swap proceeds');
});
const evidence={at:new Date().toISOString(),mode:'local actual hook with fake React/wagmi adapters; no real signatures',sourceSha256:createHash('sha256').update(source).digest('hex'),writes,flowReturnedSuccess:!!result,pass:!writes.some(w=>w.account!==A)};
const out=`review/evidence/hook-account-${Date.now()}.json`;fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({file:out,...evidence},null,2));process.exitCode=evidence.pass?0:1;
