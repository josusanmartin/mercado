import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import * as viem from 'viem';import * as chains from 'viem/chains';
const src=fs.readFileSync('apps/web/components/tour/demo-tour.tsx','utf8');
const d=JSON.parse(fs.readFileSync('packages/shared/src/deployments/42431.json','utf8'));
function load(source,deps){const m={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:1,target:99,jsx:4}}).outputText,{module:m,exports:m.exports,require:n=>deps[n]??{}});return m.exports;}
const shared=load(fs.readFileSync('packages/shared/src/chain.ts','utf8'),{'viem/chains':chains});
const rpc=viem.createPublicClient({chain:chains.tempoModerato,transport:viem.http(shared.TEMPO_RPC_URL)}),end=await rpc.getBlockNumber(),start=end-2000n;
const who='0x871aF8b66406F96C6b5f8a156242d9B7a026cC63';
const jsx=(type,props)=>({type,props});
const m=load(src+'\nexport { TraceList };',{react:{createContext:()=>({})},'react/jsx-runtime':{jsx,jsxs:jsx},wagmi:{usePublicClient:()=>({...rpc,getLogs:q=>rpc.getLogs({...q,toBlock:end})})},'@tanstack/react-query':{useQuery:q=>q},viem,'@mercado/shared':shared,'@/lib/contracts':{ADDR:{xmxn:d.v2.xMXN,ousd:d.ousd},CHAIN_ID:42431},'@/components/wallet/personas':{personaByAddress:()=>undefined},'@/lib/utils':{cn:(...x)=>x.join(' ')},'@/lib/format':{fmtAmount:String,shortAddr:x=>x}});
const rows=await m.useTrace(who,String(start)).queryFn();
const abi=viem.parseAbi(['function balanceOf(address) view returns(uint256)']);const checks=[],balances=[];
for(const [symbol,address]of[['xMXN',d.v2.xMXN],['OUSD',d.ousd]]){
 const [a,b]=await Promise.all([start-1n,end].map(blockNumber=>rpc.readContract({address,abi,functionName:'balanceOf',args:[who],blockNumber})));
 const net=rows.filter(x=>x.token===symbol).reduce((n,x)=>n+(x.dir==='in'?x.amount:-x.amount),0n);
 balances.push({symbol,start:a,end:b,delta:b-a,logNet:net});checks.push({name:symbol+' log direction and amount reconcile pinned balances',pass:b-a===net});
}
const nodes=m.TraceList({rows,empty:''});const links=(nodes.props.children??[]).map(n=>n.props.children.props.href);
checks.push({name:'rendered explorer links use actual event hashes on Moderato',pass:rows.length>0&&links.every((url,i)=>url===shared.explorerTx(rows[i].hash))});
const hashes=[...new Set(rows.map(x=>x.hash))].slice(0,8),receipts=[];
for(const hash of hashes){const r=await rpc.getTransactionReceipt({hash});receipts.push({hash,status:r.status,block:r.blockNumber});}
checks.push({name:'sample linked transfers have successful receipts',pass:receipts.length>0&&receipts.every(x=>x.status==='success')});
const out=`review/evidence/tour-live-${Date.now()}.json`;fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),mode:'Actual useTrace/TraceList + read-only live RPC. Latest pinned by adapter for reconciliation; does not fix Tour step attribution.',who,start,end,rows,balances,links,receipts,checks},(_,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify({file:out,start:String(start),end:String(end),rows:rows.length,linkedRows:links.length,receipts:receipts.length,checks}));
