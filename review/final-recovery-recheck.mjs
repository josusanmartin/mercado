import fs from'node:fs';import vm from'node:vm';import ts from'typescript';import * as viem from'viem';import{createHash}from'node:crypto';
const file='apps/web/lib/remesas/reconcile-delivery.ts',source=fs.readFileSync(file,'utf8'),m={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:1,target:99}}).outputText,{module:m,exports:m.exports,require:n=>viem,Date,BigInt,Error});
const h='0x'+'1'.repeat(64),other='0x'+'2'.repeat(64),addr='0x'+'1'.repeat(40),base={account:addr,to:'0x'+'2'.repeat(40),token:'0x'+'3'.repeat(40),chainId:42431,amount:123n,fromBlock:'100',memo:'para mamá',delivery:{hash:h,at:Date.now()-11*60000}};
const client={getBlockNumber:async()=>200n,getLogs:async()=>[],getTransactionReceipt:async()=>{throw new viem.TransactionReceiptNotFoundError({hash:h})},getTransaction:async()=>{throw new viem.TransactionNotFoundError({hash:h})}};
const rows=[];async function check(name,c,s,expect){try{const r=await m.exports.reconcile(c,s);rows.push({name,result:r,pass:expect(r)})}catch(e){rows.push({name,error:e.message,pass:expect({error:e.message})})}}
await check('receipt 429 throws; no age-based resend',{...client,getTransactionReceipt:async()=>{throw Error('HTTP 429')}},base,r=>r.error==='HTTP 429');
await check('unknown past 11min stays pending',client,base,r=>r.state==='pending');
await check('unrelated transfer cannot override pending hash',{...client,getLogs:async()=>[{args:{amount:123n},transactionHash:other}],getTransaction:async()=>({nonce:8,nonceKey:0n})},base,r=>r.state==='pending');
await check('nonzero nonce key does not use regular transactionCount',{...client,getTransactionCount:async()=>999},{...base,delivery:{...base.delivery,nonce:'8',nonceKey:'123'}},r=>r.state==='pending');
await check('exact delivered hash returns success',{...client,getTransactionReceipt:async()=>({status:'success'})},base,r=>r.state==='delivered'&&r.hash===h);
await check('no-hash wrong memo not accepted',{...client,getLogs:async()=>[{args:{amount:123n,memo:viem.stringToHex('different',{size:32})},transactionHash:other}]},{...base,delivery:undefined},r=>r.state==='clear');
fs.writeFileSync('review/final-evidence/recovery-recheck.json',JSON.stringify({at:new Date().toISOString(),file,sha256:createHash('sha256').update(source).digest('hex'),scope:'Actual module with injected reads, no broadcast',rows},null,2));console.log(JSON.stringify(rows));
