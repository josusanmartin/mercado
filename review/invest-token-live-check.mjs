import fs from 'node:fs';
import {createPublicClient,http,parseAbi} from 'viem';
import {tempoModerato} from 'viem/chains';
const d=JSON.parse(fs.readFileSync('packages/shared/src/deployments/42431.json','utf8')),v=d.v2;
const c=createPublicClient({chain:tempoModerato,transport:http('https://rpc.moderato.tempo.xyz')});
const block=await c.getBlockNumber(),art=n=>JSON.parse(fs.readFileSync(`review/out-v2/${n}.sol/${n}.json`,'utf8'));
const read=(address,abi,functionName,args=[])=>c.readContract({address,abi,functionName,args,blockNumber:block});
const evidence={at:new Date().toISOString(),block,mode:'Read-only code, state and eth_call; no broadcasts',checks:[],tokens:[],owners:[]};
function mask(code,artifact){const s=code.slice(2).split('');for(const rs of Object.values(artifact.deployedBytecode.immutableReferences??{}))for(const r of rs)s.fill('0',r.start*2,(r.start+r.length)*2);return s.join('');}
const rwa=art('DemoRWA'),vault=art('MultiCollateralVault');
for(const token of v.collaterals.filter(x=>x.symbol.includes('tTBILL'))) {
 const [code,cap,owner,params]=await Promise.all([c.getCode({address:token.token,blockNumber:block}),read(token.token,rwa.abi,'faucetCap'),read(token.token,rwa.abi,'owner'),read(v.vault,vault.abi,'params',[token.token])]);
 evidence.tokens.push({symbol:token.symbol,address:token.token,cap,owner,mintPaused:params.mintPaused,feed:params.feed});
 evidence.checks.push({name:token.symbol+' reviewed runtime',pass:mask(code,rwa)===mask(rwa.deployedBytecode.object,rwa)});
 evidence.checks.push({name:token.symbol+' faucet and vault gate',pass:token.symbol==='tTBILL'?cap===0n:cap>0n&&params.mintPaused});
 if(token.symbol==='tTBILL') {
  try{await c.simulateContract({address:token.token,abi:rwa.abi,functionName:'faucet',args:[1n],account:'0x1111111111111111111111111111111111111111',blockNumber:block});evidence.checks.push({name:'current faucet rejects',pass:false});}
  catch(err){const why=err.walk?.(x=>x.data?.errorName);evidence.checks.push({name:'current faucet rejects',pass:why?.data?.errorName==='Error'&&why.data.args[0]==='faucet cap',reason:why?.data});}
 }
}
const own=parseAbi(['function owner() view returns(address)']);
for(const [name,address] of [['vault',v.vault],['pool',v.creditPool],['card',v.card],['desk',v.investDesk],['amm',v.vamm],['factory',v.factory],['fx',v.fxOracle],...v.collaterals.filter(x=>x.symbol!=='OUSD').map(x=>[x.symbol,x.token]),...v.collaterals.filter(x=>x.symbol.includes('tTBILL')).map(x=>[x.symbol+' feed',x.feed])]) {
 evidence.owners.push({name,address,owner:await read(address,own,'owner')});
}
evidence.checks.push({name:'current owners match page single-key claim',pass:new Set(evidence.owners.map(x=>x.owner.toLowerCase())).size===1});
const file=`review/evidence/invest-token-live-${Date.now()}.json`;fs.writeFileSync(file,JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify({file,block:String(block),checks:evidence.checks,tokens:evidence.tokens.map(({symbol,cap,mintPaused})=>({symbol,cap:String(cap),mintPaused})),owners:evidence.owners.length}));
