// Read-only live evidence. No keys, signing, faucet calls, or broadcasts.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createPublicClient, http, parseAbi, decodeEventLog } from 'viem';

const root = new URL('../', import.meta.url);
const deploymentBytes = fs.readFileSync(new URL('packages/shared/src/deployments/42431.json', root));
const deployment = JSON.parse(deploymentBytes);
const client = createPublicClient({ transport: http('https://rpc.moderato.tempo.xyz', { timeout: 20_000, retryCount: 1 }) });
const abi = parseAbi([
  'function decimals() view returns (uint8)', 'function symbol() view returns (string)',
  'function currency() view returns (string)', 'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)', 'function ISSUER_ROLE() view returns (bytes32)',
  'function hasRole(address,bytes32) view returns (bool)',
  'function peek() view returns (uint256,uint256,bool)', 'function isMock() view returns (bool)',
  'function totalCollateral() view returns (uint256)', 'function totalDebt() view returns (uint256)',
  'function getPosition(address) view returns (uint256 collateral,uint256 debt)',
  'function availableLiquidity() view returns (uint256)', 'function paused() view returns (bool)',
  'function reserves() view returns (uint256,uint256)',
  'event Deposited(address indexed user,uint256 amount)', 'event Minted(address indexed user,uint256 amount)',
  'event Repaid(address indexed user,uint256 amount)', 'event Withdrawn(address indexed user,uint256 amount)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'event Liquidated(address indexed user,address indexed liquidator,uint256 debtCovered,uint256 collateralSeized)',
  'event PriceUpdated(uint256 mxnPerUsd,uint256 updatedAt)',
  'event Paused(address account)', 'event Unpaused(address account)',
]);
const evidence = {
  at: new Date().toISOString(), head: execFileSync('git', ['rev-parse','HEAD'], {cwd:root}).toString().trim(),
  deploymentSha256: createHash('sha256').update(deploymentBytes).digest('hex'), deployment,
  mode: 'read-only RPC/HTTP; no transactions broadcast', checks: [],
};
async function check(name, work) {
  try { const result = await work(); evidence.checks.push({ name, outcome: 'observed', result }); return result; }
  catch (e) { evidence.checks.push({ name, outcome: 'failed', error: e.shortMessage ?? e.message }); }
}
const chainId = await check('rpc.chainId', () => client.getChainId());
const blockNumber = await check('rpc.blockNumber', () => client.getBlockNumber());
const read = (address, functionName, args = [], block = blockNumber) => client.readContract({address, abi, functionName, args, blockNumber:block});
if (chainId !== 42431) throw new Error('Unexpected or unavailable chain');
for (const key of ['factory','oracle','vault','swapDesk','creditPool']) {
  if (/^0x0{40}$/i.test(deployment[key])) {
    evidence.checks.push({name:`deployment.${key}`, outcome:'not-deployed',address:deployment[key]});
    continue;
  }
  await check(`code.${key}`, async () => {
    const code = await client.getCode({address:deployment[key],blockNumber});
    const result={address:deployment[key],bytes:((code?.length??2)-2)/2,sha256:createHash('sha256').update(code??'0x').digest('hex')};
    const contract={factory:'LocalStableFactory',oracle:'FXOracleAdapter',vault:'CollateralVault',swapDesk:'SwapDesk',creditPool:'CreditPool'}[key];
    const path=new URL(`review/out/${contract}.sol/${contract}.json`,root);
    if(fs.existsSync(path)){
      const artifact=JSON.parse(fs.readFileSync(path));
      const runtime=artifact.deployedBytecode;
      const normalize=value=>{
        const chars=value.replace(/^0x/,'').toLowerCase().split('');
        for(const references of Object.values(runtime.immutableReferences??{}))for(const {start,length} of references)chars.fill('0',start*2,(start+length)*2);
        return chars.join('');
      };
      result.matchesLocalRuntimeExcludingImmutables=normalize(code??'0x')===normalize(runtime.object);
      result.artifact=path.pathname;
    }
    return result;
  });
}
await Promise.all([
  ...['ousd','xMXN'].flatMap(key=>['decimals','symbol','currency','totalSupply'].map(fn=>check(`${key}.${fn}`,()=>read(deployment[key],fn)))),
  check('oracle.peek',()=>read(deployment.oracle,'peek')),
  check('oracle.isMock',()=>read(deployment.oracle,'isMock')),
  check('vault.totalCollateral',()=>read(deployment.vault,'totalCollateral')),
  check('vault.totalDebt',()=>read(deployment.vault,'totalDebt')),
]);
const role = await check('xMXN.ISSUER_ROLE',()=>read(deployment.xMXN,'ISSUER_ROLE'));
for (const key of ['vault','factory','merchant']) if(role) await check(`xMXN.issuer.${key}`,()=>read(deployment.xMXN,'hasRole',[deployment[key],role]));
if(!/^0x0{40}$/i.test(deployment.swapDesk)){
  await check('swapDesk.paused',()=>read(deployment.swapDesk,'paused'));
  await check('swapDesk.reserves',()=>read(deployment.swapDesk,'reserves'));
}
if(!/^0x0{40}$/i.test(deployment.creditPool))await check('creditPool.availableLiquidity',()=>read(deployment.creditPool,'availableLiquidity'));
for (const [label,hash] of Object.entries(deployment.txs??{})) {
  await check(`receipt.${label}`,async()=>{
    const r=await client.getTransactionReceipt({hash});
    const decoded=r.logs.flatMap(log=>{
      try {return [{address:log.address,...decodeEventLog({abi,data:log.data,topics:log.topics})}];} catch{return [];}
    });
    const result={hash,status:r.status,blockNumber:r.blockNumber,from:r.from,to:r.to,contractAddress:r.contractAddress,decoded};
    if(label.startsWith('smoke.')&&!label.startsWith('smoke.approve')) {
      result.positionAfter=await read(deployment.vault,'getPosition',[r.from],r.blockNumber);
      result.supplyAfter=await read(deployment.xMXN,'totalSupply',[],r.blockNumber);
    }
    return result;
  });
}
for (const [path,body] of [
  ['/',null],['/api/fx',null],['/api/driver/demo?profile=steady',null],
  ['/api/driver/score',{borrower:deployment.merchant,profile:'steady'}],
  ['/api/bills/quote',{provider:'telcel',phone:'5512345678',amountMxn:100}],
]) {
  await check(`http.${path}`, async()=>{
    const r=await fetch(`http://localhost:3100${path}`,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25_000)});
    const text=await r.text();
    const result={status:r.status,contentType:r.headers.get('content-type'),bytes:text.length};
    if(r.headers.get('content-type')?.includes('application/json')) result.body=JSON.parse(text);
    else {
      const data=text.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
      if(data) {const parsed=JSON.parse(data[1]);result.error=parsed.err?.message;}
      result.title=text.match(/<title>(.*?)<\/title>/)?.[1];
    }
    if(r.status>=400) result.acceptance='failed';
    return result;
  });
}
const file=new URL(`evidence/live-${Date.now()}.json`,import.meta.url);
fs.writeFileSync(file,JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log(JSON.stringify({file:file.pathname,at:evidence.at,checks:evidence.checks.map(c=>({name:c.name,outcome:c.outcome,status:c.result?.status,error:c.error??c.result?.error}))},null,2));
