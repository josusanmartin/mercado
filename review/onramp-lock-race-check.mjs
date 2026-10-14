import fs from 'node:fs';
import path from 'node:path';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('apps/web/lib/remesas/onramp-ledger.ts','utf8');
const dir=fs.mkdtempSync(path.resolve('review/evidence/lock-race-'));
const file=path.join(dir,'ledger.json'),lock=file+'.lock';
// Writer A created its exclusive lock and paused before writing metadata.
fs.writeFileSync(lock,'');const old=new Date(Date.now()-6000);fs.utimesSync(lock,old,old);
let writerAResumed=false,writerBEntered=false;
const fsAdapter={...fs,renameSync:(from,to)=>{
 if(from===lock&&to.includes('.reclaim.')) {
  // A resumes after B judges the old empty file stale, but before B renames it.
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,token:'writer-A-live',at:Date.now()}));
  writerAResumed=true;
 }
 return fs.renameSync(from,to);
}};
const m={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:99,module:1}}).outputText,{module:m,exports:m.exports,require:n=>({'node:fs':fsAdapter,'node:crypto':crypto,'node:path':{default:path,...path}}[n]),process:{pid:process.pid,kill:process.kill},setTimeout});
await m.exports.withFileLock(file,async()=>{writerBEntered=true;},{waitMs:20,pollMs:1});
const evidence={at:new Date().toISOString(),mode:'Actual lock module + isolated real files; deterministic writer-resume interleaving at rename, no network',sourceHash:crypto.createHash('sha256').update(source).digest('hex'),writerAResumed,writerBEntered,pass:!(writerAResumed&&writerBEntered)};
const out=`review/evidence/onramp-lock-race-${Date.now()}.json`;fs.writeFileSync(out,JSON.stringify(evidence,null,2));console.log(JSON.stringify({file:out,...evidence}));
