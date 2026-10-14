// Isolated policy + installed Relay. Ephemeral local sponsor; no network or shared quota.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import * as viem from 'viem';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {tempoModerato} from 'viem/chains';
import {Relay} from 'viem/tempo';
const file='apps/web/app/api/sponsor/policy.ts', source=fs.readFileSync(file,'utf8');
const deployment=JSON.parse(fs.readFileSync('packages/shared/src/deployments/42431.json','utf8'));
const tokens={alphaUSD:'0x20C0000000000000000000000000000000000001',pathUSD:'0x20C0000000000000000000000000000000000000'};
const shared={moderatoDeployment:deployment,TEMPO_MODERATO_CHAIN_ID:42431,TEMPO_ADDRESSES:tokens};
function policy(){const m={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:99,module:1}}).outputText,{module:m,exports:m.exports,require:n=>n==='viem'?viem:shared,Date,BigInt,Map,Set});return m.exports;}
const p=policy(), sender='0x1111111111111111111111111111111111111111';
const base={from:sender,chainId:42431,calls:[{to:deployment.vault,data:'0xdeadbeef'}],gas:100000n,maxFeePerGas:1000000000n,maxPriorityFeePerGas:0n,feeToken:tokens.alphaUSD};
const cases=[['normal',base],['huge-fees',{...base,maxFeePerGas:10n**24n,maxPriorityFeePerGas:10n**24n}],['MXN-fee',{...base,feeToken:deployment.xMXN}],['cost-cap',{...base,gas:5000000n,maxFeePerGas:5000000000n}],['mixed-target-batch',{...base,calls:[{to:deployment.vault},{to:sender}]}],['create',{...base,calls:[{}]}],['unknown-selector',base],['arbitrary-approve',{...base,calls:[{to:deployment.ousd,data:viem.encodeFunctionData({abi:viem.parseAbi(['function approve(address,uint256)']),functionName:'approve',args:[sender,viem.maxUint256]})}]}],['wrong-chain',{...base,chainId:1}]];
const results=cases.map(([name,request])=>({name,refusal:p.refusal(request)??null}));
let downstreamCalls=0;
const client=viem.createClient({chain:tempoModerato,transport:viem.custom({request:async()=>{downstreamCalls++;throw new Error('Unexpected downstream RPC');}},{retryCount:0})});
const relay=Relay.create({client,plugins:[Relay.feePayer({account:privateKeyToAccount(generatePrivateKey()),feeToken:tokens.alphaUSD,validate:tx=>!p.refusal(tx)&&p.consumeQuota(tx.from)})]});
const request={method:'eth_fillTransaction',params:[{...base,chainId:viem.numberToHex(42431),nonce:'0x0',gas:viem.numberToHex(base.gas),maxFeePerGas:viem.numberToHex(base.maxFeePerGas),maxPriorityFeePerGas:'0x0',feePayer:true}]};
let fills=0;let localError;
try {for(let i=0;i<30;i++){const r=await relay.request(request);if(r.tx?.feePayerSignature)fills++;}}catch(e){localError=e.message.slice(0,900);}
const q=policy();let consumed=0;for(let i=0;i<500;i++){const from=viem.getAddress('0x'+(Math.floor(i/30)+1).toString(16).padStart(40,'0'));if(q.consumeQuota(from))consumed++;}
const deniedNewSender=!q.consumeQuota('0x9999999999999999999999999999999999999999');
const evidence={at:new Date().toISOString(),mode:'isolated actual policy and installed viem relay, ephemeral signer, no network/shared quota',sourceSha256:createHash('sha256').update(source).digest('hex'),results,relay:{unsignedIdenticalFillsSigned:fills,downstreamCalls,localError},quota:{consumed,deniedNewSender,senderMapResetsOnFreshProcess:policy().consumeQuota(sender)}};
const out=`review/evidence/sponsor-abuse-${Date.now()}.json`;fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({file:out,...evidence},null,2));
