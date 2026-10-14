// Read-only deployment gate. No accounts, signatures or broadcasts.
import fs from 'node:fs';import {createHash} from 'node:crypto';import {createPublicClient,http,parseAbi,formatUnits} from 'viem';import {tempoModerato} from 'viem/chains';
const raw=fs.readFileSync('packages/shared/src/deployments/42431.json','utf8'),d=JSON.parse(raw),v=d.v2;
if(!v)throw Error('v2 manifest absent');
const c=createPublicClient({chain:tempoModerato,transport:http('https://rpc.moderato.tempo.xyz')});const block=await c.getBlockNumber();
const art=n=>JSON.parse(fs.readFileSync(`review/out-v2/${n}.sol/${n}.json`,'utf8'));
const token=parseAbi(['function balanceOf(address) view returns (uint256)','function totalSupply() view returns (uint256)','function decimals() view returns (uint8)','function ISSUER_ROLE() view returns (bytes32)','function hasRole(address,bytes32) view returns (bool)']);
const read=(address,abi,functionName,args=[])=>c.readContract({address,abi,functionName,args,blockNumber:block});
const e={at:new Date().toISOString(),block,manifestSha256:createHash('sha256').update(raw).digest('hex'),receipts:[],runtimes:[],reads:{},checks:[]};
const check=(name,pass,details)=>e.checks.push({name,pass,details});
function mask(code,refs){let h=code.slice(2).split('');for(const list of Object.values(refs??{}))for(const {start,length}of list)h.fill('0',start*2,(start+length)*2);return h.join('');}
const cs=v.collaterals;const s=cs.find(x=>x.symbol==='sOUSD');const rwa=cs.find(x=>x.symbol==='tTBILL');
const pairs=[[v.factory,'MercadoFactoryV2'],[v.vault,'MultiCollateralVault'],[v.vamm,'MoveAMM'],[v.creditPool,'CreditPool'],[s.token,'StakedOUSD'],[s.feed,'ERC4626PriceFeed'],[rwa.token,'DemoRWA'],[rwa.feed,'AdminPriceFeed'],[cs.find(x=>x.symbol==='OUSD').feed,'FixedPriceFeed']];
await Promise.all(pairs.map(async([address,name])=>{try{const a=art(name),code=await c.getCode({address,blockNumber:block});const match=!!code&&mask(code,a.deployedBytecode.immutableReferences)===mask(a.deployedBytecode.object,a.deployedBytecode.immutableReferences);e.runtimes.push({name,address,match,bytes:code?.length/2-1});}catch(x){e.runtimes.push({name,error:x.shortMessage??x.message});}}));
// Small batches avoid hammering the shared RPC.
const txs=Object.entries(v.txs??{});for(let i=0;i<txs.length;i+=5)await Promise.all(txs.slice(i,i+5).map(async([name,hash])=>{try{const r=await c.getTransactionReceipt({hash});e.receipts.push({name,hash,status:r.status,blockNumber:r.blockNumber});}catch(x){e.receipts.push({name,hash,error:x.shortMessage??x.message});}}));
try{
 const [supply,decimals,state,locked,roles,totals,prices,staked,poolCash,poolToken,ammToken,cdpToken,reserveBalance]=await Promise.all([
 read(v.xMXN,token,'totalSupply'),read(v.xMXN,token,'decimals'),read(v.vamm,art('MoveAMM').abi,'state'),read(v.factory,art('MercadoFactoryV2').abi,'locked'),
 (async()=>{const role=await read(v.xMXN,token,'ISSUER_ROLE');return Object.fromEntries(await Promise.all(Object.entries({vault:v.vault,amm:v.vamm,factory:v.factory,merchant:d.merchant}).map(async([k,a])=>[k,await read(v.xMXN,token,'hasRole',[a,role])])));})(),
 Promise.all(cs.map(async x=>({symbol:x.symbol,totals:await read(v.vault,art('MultiCollateralVault').abi,'totals',[x.token])}))),
 Promise.all(cs.map(async x=>({symbol:x.symbol,price:await read(x.feed,art('FixedPriceFeed').abi,'price')}))),
 (async()=>{const a=art('StakedOUSD').abi;return Object.fromEntries(await Promise.all(['totalAssets','assetsAccounted','fundedReserve','yieldReserve','aprBps'].map(async f=>[f,await read(s.token,a,f)])));})(),
 read(v.creditPool,art('CreditPool').abi,'availableLiquidity'),read(v.creditPool,art('CreditPool').abi,'xmxn'),read(v.vamm,art('MoveAMM').abi,'xmxn'),read(v.vault,art('MultiCollateralVault').abi,'xmxn'),read(d.ousd,token,'balanceOf',[v.vamm])
 ]);
 e.reads={supply,decimals,state,locked,roles,totals,prices,staked,poolCash,poolToken,ammToken,cdpToken,reserveBalance};
 const debt=totals.reduce((a,x)=>a+x.totals[1],0n);
 check('aggregate-supply-equals-cdp-debt-plus-amm-liability',supply===debt+state[1]);
 check('tracked-reserve-is-funded',reserveBalance>=state[0]);
 check('seed-equity-at-least-2500',state[2]>=2500_000000n);
 check('redeem-cap-is-quarter-reserve',state[5]===state[0]/4n);
 check('issuers-locked-and-membership',locked&&roles.vault&&roles.amm&&!roles.factory&&!roles.merchant);
 check('pool-and-both-issuers-use-v2-token',[poolToken,ammToken,cdpToken].every(x=>x.toLowerCase()===v.xMXN.toLowerCase()));
 check('v2-pool-funded',poolCash>0n);
 const underlyingBalance=await read(d.ousd,token,'balanceOf',[s.token]); e.reads.stakedUnderlyingBalance=underlyingBalance;
 check('staked-accounted-assets-and-future-yield-funded',underlyingBalance>=staked.assetsAccounted+staked.fundedReserve);
}catch(x){e.error=x.shortMessage??x.message;}
check('all-runtime-matches',e.runtimes.length===pairs.length&&e.runtimes.every(x=>x.match));check('all-manifest-receipts-succeeded',e.receipts.length===txs.length&&e.receipts.every(x=>x.status==='success'));
const file=`review/evidence/v2-live-${Date.now()}.json`;fs.writeFileSync(file,JSON.stringify(e,(_,v)=>typeof v==='bigint'?String(v):v,2));console.log(JSON.stringify({file,block:String(block),runtimes:e.runtimes.map(x=>({name:x.name,match:x.match,error:x.error})),receipts:{total:e.receipts.length,success:e.receipts.filter(x=>x.status==='success').length},checks:e.checks,error:e.error},null,2));
