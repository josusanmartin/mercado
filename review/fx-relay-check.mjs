import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import {decideWrite,checkSourceDate} from '../packages/contracts/script/fx-relay-policy.mjs';
const file='packages/contracts/script/fx-relay.mjs', source=fs.readFileSync(file,'utf8');
// Execute only the actual rate-fetch/relay functions. Never import the wallet/key/entrypoint.
const code=source.slice(source.indexOf('async function getJson'),source.indexOf('const loopIdx'));
const cases=[];
for (const test of [
  {name:'jump-20-to-10',rate:10},
  {name:'stale-daily-2020',rate:20,daily:'Wed, 01 Jan 2020 00:00:00 GMT'},
  {name:'future-daily-2099',rate:20,daily:'Thu, 01 Jan 2099 00:00:00 GMT'},
  {name:'coinbase-no-source-timestamp',rate:20},
]) {
  const writes=[];let record;
  const sandbox={URL,Date,Number,BigInt,AbortSignal,Refused:Error,decideWrite,checkSourceDate,dep:{oracle:'mock'},abi:[],OUT:'mock',root:'file:///mock/',console:{log(){}},
    fetch:async(url)=>({ok:!test.daily||!url.includes('coinbase'),status:503,json:async()=>url.includes('coinbase')?{data:{rates:{MXN:String(test.rate)}}}:{rates:{MXN:test.rate},time_last_update_utc:test.daily}}),
    pub:{readContract:async({functionName:f})=>({mxnPerUsd:2000000000n,maxJumpBps:2000n,minPrice:500000000n,maxPrice:5000000000n,updatedAt:1791944520n})[f],waitForTransactionReceipt:async()=>({status:'success',blockNumber:123n}),getBlock:async()=>({timestamp:1791944520n})},
    wallet:{writeContract:async({args})=>{writes.push(args[0].toString());if(writes.length>20)throw Error('review safety bound');return '0x'+'12'.repeat(32);}},
    mkdirSync(){},writeFileSync(_path,data){record=JSON.parse(data);},
  };
  try {await vm.runInNewContext(code+'\nrelayOnce()',sandbox);cases.push({name:test.name,writes,record});}
  catch(e){cases.push({name:test.name,writes,error:e.message});}
}
const out=`review/evidence/fx-relay-${Date.now()}.json`;
fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),mode:'actual functions, local adapters, no network or key access',sourceSha256:createHash('sha256').update(source).digest('hex'),cases},null,2));
console.log(JSON.stringify({file:out,cases:cases.map(({name,writes,error,record})=>({name,writes,error,sourceTime:record?.sourceTime,fetchedAt:record?.fetchedAt}))}));
