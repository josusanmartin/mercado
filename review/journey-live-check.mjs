// Independently read existing QA journey receipts and public orders. Does not run or broadcast the journey.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createPublicClient,http,parseAbi,decodeEventLog,decodeFunctionData,ContractFunctionRevertedError} from 'viem';
import {Challenge} from 'mppx';
const inputPath=process.argv[2]??'scripts/evidence/last-run.json';
const input=fs.readFileSync(inputPath,'utf8'),qa=JSON.parse(input);
const d=JSON.parse(fs.readFileSync('packages/shared/src/deployments/42431.json','utf8'));
const client=createPublicClient({transport:http('https://rpc.moderato.tempo.xyz',{timeout:20000})});
const poolAbi=JSON.parse(fs.readFileSync('review/out/CreditPool.sol/CreditPool.json','utf8')).abi;
const abi=parseAbi([
 'event Transfer(address indexed from,address indexed to,uint256 value)',
 'event TransferWithMemo(address indexed from,address indexed to,uint256 amount,bytes32 indexed memo)',
 'event Borrowed(address indexed borrower,uint256 amount,uint256 fee,uint256 nonce,bytes32 dataHash)',
 'event Repaid(address indexed borrower,uint256 amount,uint256 remainingDebt)',
 'event Swapped(address indexed user,bool ousdToXmxn,uint256 amountIn,uint256 amountOut,uint256 fee)',
 'event Minted(address indexed user,uint256 amount)','event Deposited(address indexed user,uint256 amount)',
]);
const e={at:new Date().toISOString(),mode:'read-only RPC/HTTP plus replay eth_call; no broadcasts',inputPath,qaInputSha256:createHash('sha256').update(input).digest('hex'),qaSnapshot:qa,deployment:d,checks:[]};
async function check(name,fn){try{const result=await fn();e.checks.push({name,ok:true,result});return result;}catch(x){e.checks.push({name,ok:false,error:x.shortMessage??x.message});}}
for(const [step,s] of Object.entries(qa.evidence))for(const [label,url]of Object.entries(s.txs??{})){
 const hash=url.split('/').at(-1);
 await check(`${step}.${label}`,async()=>{
  const r=await client.getTransactionReceipt({hash});
  const result={hash,status:r.status,blockNumber:r.blockNumber,from:r.from,to:r.to,events:r.logs.flatMap(log=>{try{return [{address:log.address,...decodeEventLog({abi,data:log.data,topics:log.topics})}]}catch{return []}})};
  if(label.startsWith('borrow ')||label.startsWith('repay ')){
   result.debtAfter=await client.readContract({address:d.creditPool,abi:poolAbi,functionName:'getDebt',args:[r.from],blockNumber:r.blockNumber});
   result.statsAfter=await client.readContract({address:d.creditPool,abi:poolAbi,functionName:'stats',blockNumber:r.blockNumber});
  }
  if(label.startsWith('borrow ')){
   const tx=await client.getTransaction({hash});
   const input=tx.input??tx.calls?.find(c=>c.to?.toLowerCase()===d.creditPool.toLowerCase())?.input;
   if(!input)throw new Error('Borrow calldata not found in legacy input or Tempo calls');
   const decoded=decodeFunctionData({abi:poolAbi,data:input});
   try{
    await client.simulateContract({address:d.creditPool,abi:poolAbi,functionName:'borrow',args:decoded.args,account:tx.from});
    throw new Error('Replayed nonce unexpectedly accepted');
   }catch(x){
    const revert=x.walk?.(z=>z instanceof ContractFunctionRevertedError);
    if(revert?.data?.errorName!=='NonceAlreadyUsed')throw x;
    result.replayRevert=revert.data.errorName;
   }
  }
  return result;
 });
}
const orders=new Set();
for(const note of qa.evidence.J5?.notes??[]){
 const i=note.indexOf('Payment id=');if(i<0)continue;
 try{orders.add(Challenge.deserialize(note.slice(i)).request.externalId);}catch{}
}
for(const id of orders)await check(`order.${id}`,async()=>{
 const r=await fetch('http://localhost:3100/api/bills/orders/'+id,{signal:AbortSignal.timeout(20000)}),o=await r.json();
 const result={status:r.status,order:o};
 if(o.receipt?.txHash){
  const receipt=await client.getTransactionReceipt({hash:o.receipt.txHash});
  result.chainStatus=receipt.status;
  result.paymentEvents=receipt.logs.flatMap(log=>{try{return [{address:log.address,...decodeEventLog({abi,data:log.data,topics:log.topics})}]}catch{return []}});
  result.matchingTransfers=result.paymentEvents.filter(x=>x.address.toLowerCase()===o.receipt.token.toLowerCase()&&x.eventName==='Transfer'&&x.args.to.toLowerCase()===d.merchant.toLowerCase()&&x.args.value===BigInt(o.receipt.amount)).length;
 }
 return result;
});
const file=`review/evidence/journey-live-${Date.now()}.json`;fs.writeFileSync(file,JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log(JSON.stringify({file,qaAt:qa.at,checks:e.checks.map(c=>({name:c.name,ok:c.ok,status:c.result?.status,error:c.error,replayRevert:c.result?.replayRevert,chainStatus:c.result?.chainStatus,matchingTransfers:c.result?.matchingTransfers}))},null,2));
