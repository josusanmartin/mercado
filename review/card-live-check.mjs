import fs from 'node:fs';import {createHash} from 'node:crypto';import{createPublicClient,http,hashTypedData,parseAbi}from'viem';import{tempoModerato}from'viem/chains';
const raw=fs.readFileSync('packages/shared/src/deployments/42431.json','utf8'),d=JSON.parse(raw),v=d.v2,a=JSON.parse(fs.readFileSync('review/out-v2/MercadoCard.sol/MercadoCard.json','utf8'));
const c=createPublicClient({chain:tempoModerato,transport:http('https://rpc.moderato.tempo.xyz')});const block=await c.getBlockNumber();
const e={at:new Date().toISOString(),block,card:v.card,manifestSha256:createHash('sha256').update(raw).digest('hex'),receipts:[],checks:[]};const check=(name,pass)=>e.checks.push({name,pass});
const read=(functionName,args=[])=>c.readContract({address:v.card,abi:a.abi,functionName,args,blockNumber:block});
function mask(code){let x=code.slice(2).split('');for(const list of Object.values(a.deployedBytecode.immutableReferences??{}))for(const r of list)x.fill('0',2*r.start,2*(r.start+r.length));return x.join('');}
try {
 const [code,token,stats,card,merchant]=await Promise.all([c.getCode({address:v.card,blockNumber:block}),read('xmxn'),read('stats'),read('getCard',[1n]),read('merchant',[d.merchant])]);
 e.state={token,stats,card,merchant};check('runtime-matches-reviewed-artifact',mask(code)===mask(a.deployedBytecode.object));check('settlement-token-is-v2-xMXN',token.toLowerCase()===v.xMXN.toLowerCase());check('merchant-enabled',merchant[0]);check('card-holder-nonzero',card.holder!=='0x0000000000000000000000000000000000000000');
 const tap={cardId:1n,holder:card.holder,merchant:d.merchant,amount:45000000n,merchantRef:'0x'+'41'.repeat(32),nonce:123456789n,deadline:9999999999n};
 const types={Tap:[{name:'cardId',type:'uint256'},{name:'holder',type:'address'},{name:'merchant',type:'address'},{name:'amount',type:'uint256'},{name:'merchantRef',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]};
 const digest=hashTypedData({domain:{name:'MercadoCard',version:'1',chainId:42431,verifyingContract:v.card},types,primaryType:'Tap',message:tap});
 check('local-EIP712-digest-equals-chain',digest===await read('tapDigest',Object.values(tap)));
 const txs=Object.entries(v.txs??{}).filter(([k])=>/card/i.test(k));for(const[name,hash]of txs){const r=await c.getTransactionReceipt({hash});e.receipts.push({name,hash,status:r.status,blockNumber:r.blockNumber});}check('all-card-stage-receipts-success',txs.length>0&&e.receipts.every(r=>r.status==='success'));
 const event=parseAbi(['event CardCharged(uint256 indexed chargeId,uint256 indexed cardId,address indexed merchant,address holder,uint256 amount,bytes32 merchantRef)']);
 const logs=await c.getLogs({address:v.card,event:event[0],fromBlock:BigInt(v.startBlock),toBlock:block,strict:true});e.charges=logs.map(r=>({txHash:r.transactionHash,...r.args}));check('CardCharged-sum-matches-gross-spend',logs.reduce((n,r)=>n+r.args.amount,0n)===stats[1]);
}catch(x){e.error=x.shortMessage??x.message;}
const file=`review/evidence/card-live-${Date.now()}.json`;fs.writeFileSync(file,JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify({file,block:String(block),card:v.card,checks:e.checks,receipts:e.receipts.length,error:e.error}));
