// Actual sponsorship policy only; does not load a key, sign, call a relay, or broadcast.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import * as viem from 'viem';
const file='apps/web/app/api/sponsor/policy.ts',source=fs.readFileSync(file,'utf8');
const d=JSON.parse(fs.readFileSync('packages/shared/src/deployments/42431.json','utf8'));
const shared={moderatoDeployment:d,TEMPO_MODERATO_CHAIN_ID:42431,TEMPO_ADDRESSES:{alphaUSD:'0x20C0000000000000000000000000000000000001'},FEE_TOKEN:'0x20C0000000000000000000000000000000000001'};
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,require:n=>{if(n==='viem')return viem;if(n==='@mercado/shared')return shared;throw new Error('Unknown '+n)},Date,BigInt,Map,Set},{filename:file});
const base={from:d.merchant,chainId:42431,calls:[{to:d.vault}],gas:5000000n,feeToken:shared.FEE_TOKEN};
const cases=[
 {name:'enormous-priority-fee',request:{...base,maxFeePerGas:10n**24n,maxPriorityFeePerGas:10n**24n}},
 {name:'MXN-as-fee-token',request:{...base,feeToken:d.xMXN,maxFeePerGas:1n,maxPriorityFeePerGas:1n}},
];
const results=cases.map(({name,request})=>({name,refusal:m.exports.refusal(request)??null,request}));
const evidence={at:new Date().toISOString(),mode:'local pure policy; no keys, signing, RPC or broadcast',sourceSha256:createHash('sha256').update(source).digest('hex'),results};
const out=`review/evidence/sponsor-policy-${Date.now()}.json`;fs.writeFileSync(out,JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log(JSON.stringify({file:out,...evidence},(_,v)=>typeof v==='bigint'?v.toString():v,2));process.exitCode=results.every(r=>r.refusal!==null)?0:1;
