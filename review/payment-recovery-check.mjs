// Actual order orchestration/store; injected reconciliation outcomes. No chain transfers.
import ts from 'typescript';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as viem from 'viem';
import * as mppx from 'mppx';
const require = createRequire(import.meta.url);
const stamp=Date.now(), dir=resolve('review/evidence');
process.env.MERCADO_ORDERS_FILE=resolve(dir,`recovery-orders-${stamp}.json`);
const sources={};
function load(file,deps) {
  const source=readFileSync(file,'utf8'); sources[file]=createHash('sha256').update(source).digest('hex');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const m={exports:{}};
  vm.runInNewContext(code,{module:m,exports:m.exports,require:n=>Object.hasOwn(deps,n)?deps[n]:require(n),console,process,Date,BigInt,Symbol,Promise,setTimeout,clearTimeout,Headers,Request,Response},{filename:file});
  return m.exports;
}
const shared={SIMULATED_FULFILLMENT_LABEL:'SIMULATED fulfillment, no real top-up',TEMPO_MODERATO_CHAIN_ID:42431,explorerTx:h=>`https://explore.testnet.tempo.xyz/tx/${h}`};
const store=load('apps/web/lib/server/bills/store.ts',{'../env':{repoRoot:()=>process.cwd()}});
const providers=load('apps/web/lib/server/bills/providers.ts',{'@mercado/shared':shared});
const lock=load('apps/web/lib/server/bills/lock.ts',{});
let charges=0,scans=0,scanMode='fail';
const service=load('apps/web/lib/server/bills/service.ts',{
  viem,mppx,'@mercado/shared':shared,
  '../../mpp/server':{
    billPaymentToken:()=>({address:`0x${'11'.repeat(20)}`,symbol:'xMXN',interim:false}), merchantAddress:()=>`0x${'22'.repeat(20)}`,
    credentialKind:()=>null, ownCredential:()=>null,
    charge:async()=>{charges++;return {paid:false,challenge:new Response('{}',{status:402})};},
  },
  '../../mpp/reconcile':{
    currentBlock:async()=>100n,
    findSettledAttempt:async()=>{scans++;if(scanMode==='fail')throw new Error('injected reconciliation RPC unavailable');return {txHash:`0x${'44'.repeat(32)}`,payer:`0x${'33'.repeat(20)}`,challengeId:'previous-attempt'};},
  },
  '../fx':{getFx:()=>{throw new Error('unexpected FX');}},'./providers':providers,'./store':store,'./lock':lock,
});
const results=[];
for(const scenario of ['unresolved-after-hold-rpc-failure','expired-quote-already-settled']) {
  const q=await service.createQuote({provider:'telcel',phone:'5512345678',amountMxn:100});
  const body={quoteId:q.quoteId,idempotencyKey:`review-recovery-${stamp}-${scenario}`};
  const req=()=>new Request('http://localhost/review',{method:'POST'});
  await service.payBill(req(),body);
  await store.withStore(db=>{
    const o=db.orders[db.idempotency[body.idempotencyKey]];
    o.pendingAttempts=[{challengeId:'previous-attempt',kind:'transaction',fromBlock:'1',at:new Date(Date.now()-120000).toISOString(),holdUntil:Date.now()-60000,keepUntil:Date.now()-60000}];
    if(scenario==='expired-quote-already-settled')db.quotes[q.quoteId].expiresAt=1;
  });
  scanMode=scenario==='expired-quote-already-settled'?'found':'fail';charges=0;scans=0;
  let outcome;
  try{const r=await service.payBill(req(),body);outcome={kind:r.kind,status:r.body?.status??r.response?.status};}
  catch(e){outcome={error:e.code??e.message,status:e.status};}
  const o=await store.readStore(db=>db.orders[db.idempotency[body.idempotencyKey]]);
  const pass=scenario==='unresolved-after-hold-rpc-failure'?outcome.error==='SETTLEMENT_PENDING'&&charges===0:outcome.status==='FULFILLED_SIMULATED'&&charges===0;
  results.push({scenario,pass,charges,scans,outcome,orderStatus:o.status,history:o.history});
}
const evidence={at:new Date().toISOString(),kind:'local actual service/store; mocked RPC reconciliation, no transfers',sources,results};
const file=resolve(dir,`payment-recovery-${stamp}.json`);writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({file,...evidence},null,2));
process.exitCode=results.every(r=>r.pass)?0:1;
