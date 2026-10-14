// Review-only regression probe: actual bill orchestration and file store, mocked settlement.
// No RPC, real credentials, or testnet token transfers. Run from the repo root.
import ts from 'typescript';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as viem from 'viem';

const require = createRequire(import.meta.url);
const dir = resolve('review/evidence');
mkdirSync(dir, { recursive: true });
process.env.MERCADO_ORDERS_FILE = resolve(dir, `race-orders-${Date.now()}.json`);
const sources = {};
function load(file, deps) {
  const source = readFileSync(file, 'utf8');
  sources[file] = createHash('sha256').update(source).digest('hex');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(code, {
    module: m, exports: m.exports,
    require: (name) => Object.hasOwn(deps, name) ? deps[name] : require(name),
    console, process, Date, BigInt, Symbol, Promise, setTimeout, clearTimeout, Headers, Response,
  }, { filename: file });
  return m.exports;
}

const shared = {
  SIMULATED_FULFILLMENT_LABEL: 'SIMULATED fulfillment, no real top-up',
  TEMPO_MODERATO_CHAIN_ID: 42431,
  explorerTx: (h) => `https://explore.testnet.tempo.xyz/tx/${h}`,
};
const store = load('apps/web/lib/server/bills/store.ts', { '../env': { repoRoot: () => process.cwd() } });
const providers = load('apps/web/lib/server/bills/providers.ts', { '@mercado/shared': shared });
const lock = load('apps/web/lib/server/bills/lock.ts', {});
let settlements = 0;
const service = load('apps/web/lib/server/bills/service.ts', {
  viem, '@mercado/shared': shared,
  '../../mpp/server': {
    billPaymentToken: () => ({ address: `0x${'11'.repeat(20)}`, symbol: 'xMXN', interim: false }),
    merchantAddress: () => `0x${'22'.repeat(20)}`,
    charge: async (_request, options) => {
      const n = ++settlements;
      await new Promise((r) => setTimeout(r, 40));
      return {
        paid: true, txHash: `0x${n.toString(16).padStart(64, '0')}`,
        payer: `0x${'33'.repeat(20)}`, externalId: options.externalId,
        receiptHeader: `mock-receipt-${n}`, receipt: {},
      };
    },
  },
  '../fx': { getFx: () => { throw new Error('No FX fallback expected'); } },
  './providers': providers, './store': store, './lock': lock,
});
const q = await service.createQuote({ provider: 'telcel', phone: '5512345678', amountMxn: 100 });
const body = { quoteId: q.quoteId, idempotencyKey: `review-concurrent-${Date.now()}` };
const results = await Promise.all([service.payBill({}, body), service.payBill({}, body)]);
const evidence = {
  at: new Date().toISOString(), kind: 'local orchestration probe, settlement mocked', sources,
  settlements, orderIds: results.map((r) => r.body?.orderId),
  recordedReceipts: results.map((r) => r.body?.receipt?.txHash),
  receiptHeaders: results.map((r) => r.receiptHeader),
  pass: settlements === 1 && results[0].body?.orderId === results[1].body?.orderId,
};
writeFileSync(resolve(dir, `pay-concurrency-${Date.now()}.json`), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
process.exitCode = evidence.pass ? 0 : 1;
