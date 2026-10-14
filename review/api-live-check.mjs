// Live HTTP plus eth_call only. Creates unpaid synthetic quotes/orders; never pays or signs a transaction.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createPublicClient, http, recoverTypedDataAddress, parseAbi } from 'viem';
import { Challenge } from 'mppx';
const d=JSON.parse(fs.readFileSync('packages/shared/src/deployments/42431.json','utf8'));
const pub=createPublicClient({transport:http('https://rpc.moderato.tempo.xyz',{timeout:20000})});
const e={at:new Date().toISOString(),deployment:d,mode:'HTTP probes + read-only eth_call; no broadcasts',checks:[]};
async function check(name,fn){try{const r=await fn();e.checks.push({name,ok:true,result:r});return r;}catch(x){e.checks.push({name,ok:false,error:x.shortMessage??x.message});}}
async function request(path,body){const r=await fetch('http://localhost:3100'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});const text=await r.text();let value;try{value=JSON.parse(text);}catch{value={text:text.slice(0,300)}}return {status:r.status,body:value,headers:Object.fromEntries(r.headers)};}
const score=await check('score.steady',()=>request('/api/driver/score',{borrower:d.merchant,profile:'steady'}));
await check('score.new-driver',()=>request('/api/driver/score',{borrower:d.merchant,profile:'new-driver'}));
await check('driver.invalid-profile',()=>request('/api/driver/demo?profile=unknown'));
await check('bills.invalid-amount',()=>request('/api/bills/quote',{provider:'telcel',phone:'5512345678',amountMxn:77}));
const q=await check('bills.quote',()=>request('/api/bills/quote',{provider:'telcel',phone:'5512345678',amountMxn:20}));
if(q?.status===200){
  const body={quoteId:q.body.quoteId,idempotencyKey:`review-unpaid-${Date.now()}`};
  const unpaid=await check('bills.unpaid',()=>request('/api/bills/pay',body));
  if(unpaid?.status===402) await check('bills.challenge-binding',()=>{
    const c=Challenge.deserialize(unpaid.headers['www-authenticate']);
    if(c.request.amount!==q.body.amount||c.request.currency.toLowerCase()!==q.body.token.toLowerCase()||c.request.recipient.toLowerCase()!==q.body.recipient.toLowerCase())throw new Error('Challenge terms differ from quote');
    if(c.request.externalId!==unpaid.headers['x-mercado-order-id'])throw new Error('Challenge not bound to returned order');
    return c;
  });
  await check('bills.same-unpaid-order',()=>request('/api/bills/pay',body));
  await check('bills.quote-conflict',()=>request('/api/bills/pay',{...body,idempotencyKey:body.idempotencyKey+'-other'}));
  if(unpaid?.headers['x-mercado-order-id'])await check('bills.order',()=>request('/api/bills/orders/'+unpaid.headers['x-mercado-order-id']));
}
const att=score?.body?.attestation;
if(att){
 const abi=JSON.parse(fs.readFileSync('review/out/CreditPool.sol/CreditPool.json','utf8')).abi;
 const types={Eligibility:[{name:'borrower',type:'address'},{name:'maxAmount',type:'uint256'},{name:'expiry',type:'uint256'},{name:'nonce',type:'uint256'},{name:'dataHash',type:'bytes32'}]};
 const message={borrower:att.borrower,maxAmount:BigInt(att.maxAmount),expiry:BigInt(att.expiry),nonce:BigInt(att.nonce),dataHash:att.dataHash};
 await check('credit.signature-domain',async()=>{
  const signer=await pub.readContract({address:d.creditPool,abi,functionName:'attestationSigner'});
  const recovered=await recoverTypedDataAddress({domain:{name:'MercadoCreditPool',version:'1',chainId:att.chainId,verifyingContract:att.pool},types,primaryType:'Eligibility',message,signature:att.signature});
  if(signer.toLowerCase()!==recovered.toLowerCase()||att.pool.toLowerCase()!==d.creditPool.toLowerCase()||att.chainId!==42431)throw new Error('Signature/domain mismatch');
  return {signer,recovered,pool:att.pool};
 });
 await check('credit.capacity',async()=>{
  const capacity=await pub.readContract({address:d.creditPool,abi,functionName:'borrowCapacity',args:[att.borrower,BigInt(att.maxAmount)]});
  if(capacity.toString()!==score.body.availableToBorrow)throw new Error('API/live capacity differ (check concurrent pool changes)');
  return {capacity,api:score.body.availableToBorrow};
 });
 const amount=BigInt(score.body.availableToBorrow);
 if(amount>0n)await check('credit.live-borrow-simulation',async()=>{
  await pub.simulateContract({address:d.creditPool,abi,functionName:'borrow',account:att.borrower,args:[amount,message.maxAmount,message.expiry,message.nonce,message.dataHash,att.signature]});
  return {amount,borrower:att.borrower,onlySimulation:true};
 });
}
for(const [key,functionName] of [['swapDesk','reserves'],['creditPool','availableLiquidity']]){
 if(!/^0x0{40}$/.test(d[key]))await check(`${key}.${functionName}`,()=>pub.readContract({address:d[key],abi:parseAbi(['function reserves() view returns(uint256,uint256)','function availableLiquidity() view returns(uint256)']),functionName}));
}
e.sourceHashes=Object.fromEntries(['apps/web/lib/server/bills/service.ts','apps/web/lib/server/credit/index.ts','apps/web/lib/mpp/reconcile.ts'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const file=`review/evidence/api-live-${Date.now()}.json`;fs.writeFileSync(file,JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log(JSON.stringify({file,checks:e.checks.map(c=>({name:c.name,ok:c.ok,status:c.result?.status,error:c.error}))},null,2));
