import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import * as viem from 'viem';import {createHash} from 'node:crypto';
const file='apps/web/lib/remesas/reconcile-delivery.ts',source=fs.readFileSync(file,'utf8'),m={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:1,target:99}}).outputText,{module:m,exports:m.exports,require:n=>{if(n==='viem')return viem;throw Error(n)},Date,BigInt});
const h='0x'+'1'.repeat(64),other='0x'+'2'.repeat(64),addr='0x'+'1'.repeat(40),base={account:addr,to:'0x'+'2'.repeat(40),token:'0x'+'3'.repeat(40),chainId:42431,amount:123n,fromBlock:'100',memo:'para mamá',delivery:{hash:h,at:Date.now()-11*60000}};
const baseClient={getBlockNumber:async()=>200n,getLogs:async()=>[],getTransactionReceipt:async()=>{throw Error('HTTP 429')},getTransaction:async()=>{throw Error('RPC timeout')}};
const cases=[];
cases.push({name:'receipt and transaction RPC errors after 11 minutes',expected:'pending or throw; never clear',actual:await m.exports.reconcile(baseClient,base)});
cases.push({name:'same amount unrelated transfer overrides known pending delivery hash',expected:'pending until exact delivery resolved',actual:await m.exports.reconcile({...baseClient,getLogs:async()=>[{args:{amount:123n},transactionHash:other}],getTransaction:async()=>({hash:h,blockNumber:null})},base)});
fs.writeFileSync('review/final-evidence/recovery-probe.json',JSON.stringify({at:new Date().toISOString(),file,sha256:createHash('sha256').update(source).digest('hex'),scope:'Actual current module, injected read adapters, no broadcast',cases},null,2));console.log(JSON.stringify(cases));
