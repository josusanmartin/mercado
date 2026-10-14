import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as viem from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {tempoModerato} from 'viem/chains';
import {createHash} from 'node:crypto';

const source=fs.readFileSync('apps/web/app/api/sponsor/policy.ts','utf8');
const d=JSON.parse(fs.readFileSync('packages/shared/src/deployments/42431.json','utf8'));
const v=d.v2,A={...v,protocol:'v2',ousd:d.ousd};
const art=n=>JSON.parse(fs.readFileSync(`review/out-v2/${n}.sol/${n}.json`,'utf8')).abi;
const abis={collateralVaultAbi:art('CollateralVault'),creditPoolAbi:art('CreditPool'),swapDeskAbi:art('SwapDesk'),moveAmmAbi:art('MoveAMM'),multiCollateralVaultAbi:art('MultiCollateralVault'),stakedOusdAbi:art('StakedOUSD'),investDeskAbi:art('InvestDesk'),mercadoCardAbi:art('MercadoCard'),tip20Abi:viem.parseAbi(['function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)','function transferWithMemo(address,uint256,bytes32) returns(bool)'])};
const signer=privateKeyToAccount(viem.toHex(12345n,{size:32})); // public local fixture, never funded
const who='0x1111111111111111111111111111111111111111';let used=false;
const client={readContract:async q=>q.functionName==='attestationSigner'?signer.address:q.functionName==='nonceUsed'?used:q.functionName==='cardsOf'?[]:0n};
const deps={viem:{...viem,createPublicClient:()=>client},'@mercado/shared':{...abis,tempoModerato,activeAddresses:()=>A,TEMPO_MODERATO_CHAIN_ID:42431,TEMPO_RPC_URL:'http://no-network.invalid',TEMPO_ADDRESSES:{alphaUSD:'0x20c0000000000000000000000000000000000001',pathUSD:'0x20c0000000000000000000000000000000000000'}}};
const m={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:99,module:1}}).outputText,{module:m,exports:m.exports,require:n=>deps[n]});const p=m.exports;
const tests=[],check=(name,pass,detail)=>tests.push({name,pass,detail});
const base={from:who,chainId:42431,gas:100000n,maxFeePerGas:1000000000n};
for(const [label,target,abi,allowed] of [
 ['Card',v.card,abis.mercadoCardAbi,['issueCard','setDailyLimit','setFrozen','charge','refund']],
 ['InvestDesk',v.investDesk,abis.investDeskAbi,['buy','sell','buyWithXmxn','sellForXmxn']],
 ['sOUSD',v.collaterals.find(c=>c.symbol==='sOUSD').token,abis.stakedOusdAbi,['deposit','redeem','withdraw','approve']],
]) {
 for(const fn of abi.filter(x=>x.type==='function'&&!['view','pure'].includes(x.stateMutability)&&!allowed.includes(x.name))) {
  const reason=p.refusal({...base,calls:[{to:target,data:viem.toFunctionSelector(fn)}]});check(`${label}.${fn.name} not sponsored`,!!reason,reason);
 }
}
const types={Eligibility:[{name:'borrower',type:'address'},{name:'maxAmount',type:'uint256'},{name:'expiry',type:'uint256'},{name:'nonce',type:'uint256'},{name:'dataHash',type:'bytes32'}]};
const domain={name:'MercadoCreditPool',version:'1',chainId:42431,verifyingContract:v.creditPool};
const normal={borrower:who,maxAmount:100n,expiry:BigInt(Math.floor(Date.now()/1000)+600),nonce:777n,dataHash:viem.zeroHash};
async function request(message=normal,amount=10n,signDomain=domain,key=signer){const signature=await key.signTypedData({domain:signDomain,types,primaryType:'Eligibility',message});return {...base,calls:[{to:v.creditPool,data:viem.encodeFunctionData({abi:abis.creditPoolAbi,functionName:'borrow',args:[amount,message.maxAmount,message.expiry,message.nonce,message.dataHash,signature]})}]};}
for(const [name,msg,amount,dom,key,expected] of [
 ['valid-first-draw',normal,10n,domain,signer,true],
 ['wrong-borrower',{...normal,borrower:'0x2222222222222222222222222222222222222222'},10n,domain,signer,false],
 ['expired',{...normal,expiry:1n},10n,domain,signer,false],
 ['over-max',normal,101n,domain,signer,false],
 ['zero',normal,0n,domain,signer,false],
 ['wrong-chain-domain',normal,10n,{...domain,chainId:1},signer,false],
 ['wrong-key',normal,10n,domain,privateKeyToAccount(viem.toHex(54321n,{size:32})),false],
]){const req=await request(msg,amount,dom,key);check(name,(await p.validFirstDraw(req))===expected);}
used=true;check('used-nonce-refused',!(await p.validFirstDraw(await request())));used=false;
const good=await request();check('borrow-plus-admin-refused',!!p.refusal({...good,calls:[...good.calls,{to:v.card,data:viem.toFunctionSelector('pause()')}]}));
check('31st-distinct-fill-refused',Array.from({length:31},(_,n)=>p.consumeQuota(who,`fixture-${n}`)).filter(Boolean).length===30);
const file=`review/evidence/sponsor-v2-boundaries-${Date.now()}.json`;
fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),mode:'Actual sponsor policy, local real EIP-712 signatures and RPC state adapters; no live signing/quota consumption',sourceHash:createHash('sha256').update(source).digest('hex'),tests},null,2));console.log(JSON.stringify({file,tests:tests.length,failures:tests.filter(t=>!t.pass)}));
