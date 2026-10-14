import fs from 'node:fs';import{createPublicClient,http,parseAbi}from'viem';import{tempoModerato}from'viem/chains';
const d=JSON.parse(fs.readFileSync('packages/shared/src/deployments/42431.json','utf8')),v=d.v2;
const a=JSON.parse(fs.readFileSync('review/out-v2/InvestDesk.sol/InvestDesk.json','utf8'));
const c=createPublicClient({chain:tempoModerato,transport:http('https://rpc.moderato.tempo.xyz')});const block=await c.getBlockNumber();const t=v.collaterals.find(c=>c.symbol==='tTBILL');
const e={at:new Date().toISOString(),block,desk:v.investDesk,checks:[]};const check=(name,pass)=>e.checks.push({name,pass});
const read=(functionName,args=[])=>c.readContract({address:v.investDesk,abi:a.abi,functionName,args,blockNumber:block});
function mask(code){let x=code.slice(2).split('');for(const list of Object.values(a.deployedBytecode.immutableReferences??{}))for(const r of list)x.fill('0',2*r.start,2*(r.start+r.length));return x.join('');}
try {
 const [code,ousd,tbill,xmxn,feed,amm,reserves,paused,spread,max]=await Promise.all([c.getCode({address:v.investDesk,blockNumber:block}),...['ousd','tbill','xmxn','feed','amm','reserves','paused','spreadBps','maxTradeUsd'].map(f=>read(f))]);
 const token=parseAbi(['function balanceOf(address) view returns (uint256)']);const balances=await Promise.all([ousd,tbill].map(address=>c.readContract({address,abi:token,functionName:'balanceOf',args:[v.investDesk],blockNumber:block})));
 e.state={ousd,tbill,xmxn,feed,amm,reserves,balances,paused,spread,max};check('reviewed-runtime-match',mask(code)===mask(a.deployedBytecode.object));check('active-v2-token-and-contract-bindings',ousd.toLowerCase()===d.ousd.toLowerCase()&&tbill.toLowerCase()===t.token.toLowerCase()&&xmxn.toLowerCase()===v.xMXN.toLowerCase()&&feed.toLowerCase()===t.feed.toLowerCase()&&amm.toLowerCase()===v.vamm.toLowerCase());check('tracked-inventory-funded',balances[0]>=reserves[0]&&balances[1]>=reserves[1]);check('desk-live-with-bounded-spread',!paused&&spread<=200n&&max>0n);
 e.quote=await read('quoteBuy',[100000000n]);check('live-quote-positive',e.quote[0]>0n);
 try{await c.simulateContract({address:v.investDesk,abi:a.abi,functionName:'sell',args:[1000000n,0n],account:'0x1111111111111111111111111111111111111111'});check('unbought-sale-rejected',false);}catch(err){const why=err.walk?.(x=>x.data?.errorName);e.rejectedSale=why?.data;check('unbought-sale-rejected',why?.data?.errorName==='ExceedsBoughtBalance');}
 const txs=Object.entries(v.txs??{}).filter(([k])=>/invest/i.test(k));e.receipts=[];for(const[name,hash]of txs){const r=await c.getTransactionReceipt({hash});e.receipts.push({name,hash,status:r.status,to:r.to,contractAddress:r.contractAddress});}check('manifest-invest-receipts-success',txs.length>0&&e.receipts.every(r=>r.status==='success'));
}catch(err){e.error=err.shortMessage??err.message;}
const file=`review/evidence/invest-live-${Date.now()}.json`;fs.writeFileSync(file,JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify({file,block:String(block),desk:v.investDesk,checks:e.checks,receipts:e.receipts?.length,error:e.error}));
