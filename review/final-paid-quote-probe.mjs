import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import * as viem from 'viem';import {createHash} from 'node:crypto';
const file='apps/web/app/api/move/quote/route.ts',src=fs.readFileSync(file,'utf8');let reads=0,charges=0,records=0;
class MoveQuoteError extends Error {constructor(status,message,code){super(message);Object.assign(this,{status,code})}}
const deps={
 '@mercado/shared':{MoveQuoteQuerySchema:{safeParse:()=>({success:true,data:{side:'usd_to_mxn',amount:'100'}})}},viem,'viem/accounts':{},
 '@/lib/mpp/server':{billPaymentToken:()=>({address:'0x'+'1'.repeat(40),symbol:'xMXN'}),merchantAddress:()=>('0x'+'2'.repeat(40)),charge:async()=>{charges++;return {paid:true,txHash:'0x'+'1'.repeat(64),receiptHeader:'verified-payment'}}},
 '@/lib/server/credit':{canonicalJson:JSON.stringify},'@/lib/server/env':{env:()=>undefined},
 '@/lib/server/http':{jsonError:(s,message,code)=>Response.json({message,code},{status:s})},'@/lib/server/protocol':{ProtocolUnavailableError:class extends Error{}},
 '@/lib/server/move/quote':{MoveQuoteError,quoteMove:async()=>{reads++;if(reads===2)throw new MoveQuoteError(502,'RPC timeout after confirmed payment','RPC_ERROR');return {protocol:'v2',amountOut:'1830000000'}}},
 '@/lib/mpp/ledger':{recordPaidCall:async()=>records++},'@/lib/mpp/pricing':{PRICES:{'move-quote':'0.50'}}};
const m={exports:{}};vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{module:1,target:99}}).outputText,{module:m,exports:m.exports,require:n=>{if(!(n in deps))throw Error(n);return deps[n]},Response,URL,Date,console});
const response=await m.exports.GET(new Request('http://localhost/api/move/quote?access=partner&side=usd_to_mxn&amount=100'));
const out={at:new Date().toISOString(),file,sha256:createHash('sha256').update(src).digest('hex'),scope:'Actual route with injected payment/quote adapters; no payment sent',reads,charges,records,status:response.status,body:await response.json(),receiptReturned:response.headers.get('Payment-Receipt')};
fs.writeFileSync('review/final-evidence/paid-quote-probe.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
