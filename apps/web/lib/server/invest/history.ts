// A wallet's own Invest activity (deposits, withdrawals, desk trades) from chain logs, indexed SERVER-side so
// browsers never fire eth_getLogs bursts at the public RPC (429s). Incremental per wallet: each call scans only
// blocks after the last scan, one request at a time, through the retrying server client.
import { parseAbiItem, type Address } from "viem";
import { publicClient } from "../chain";
import { serverAddresses } from "../protocol";
import { vaultAddress } from "./rates";

const CHUNK = 50_000n;
const MIN_INTERVAL_MS = 4_000; // calls within this window reuse the last scan

const supplied = parseAbiItem("event Supplied(address indexed lender, uint256 amount)");
const withdrawn = parseAbiItem("event Withdrawn(address indexed lender, uint256 amount)");
const depositEv = parseAbiItem(
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
);
const withdrawEv = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
);
const bought = parseAbiItem(
  "event Bought(address indexed user, bool withXmxn, uint256 payIn, uint256 ousdUsed, uint256 tbillOut, uint256 fee, uint256 px)",
);
const sold = parseAbiItem(
  "event Sold(address indexed user, bool forXmxn, uint256 tbillIn, uint256 ousdOut, uint256 received, uint256 fee, uint256 px)",
);

export type InvestRow = {
  product: "pesos" | "dolares" | "acciones" | "tbills"; // tbills: legacy trades only
  label: string;
  amount: bigint;
  symbol: string;
  txHash: `0x${string}`;
  block: bigint;
  logIndex: number;
  /** Unix seconds, from the log's blockTimestamp. */
  timestamp?: number;
};

const TOTALS = [
  "pesosIn", "pesosOut", "dolIn", "dolOut", "sharesIn", "sharesOut",
  "tbCost", "tbProceeds", "tbIn", "tbOut",
  "vaultIn", "vaultOut", "sxSharesIn", "sxSharesOut",
  "idxCost", "idxProceeds", "idxIn", "idxOut",
] as const;
type State = { next: bigint; at: number; rows: InvestRow[]; t: Record<(typeof TOTALS)[number], bigint> };

const cache = new Map<string, State>();
const inflight = new Map<string, Promise<State>>();

export async function getInvestHistory(wallet: Address) {
  const st = await scan(wallet);
  const t = st.t;
  return {
    rows: st.rows,
    netPesos: t.pesosIn - t.pesosOut,
    netDolares: t.dolIn - t.dolOut,
    netTbillCost: t.tbCost - t.tbProceeds,
    sharesFromEvents: t.sharesIn - t.sharesOut,
    tbillFromEvents: t.tbIn - t.tbOut,
    netPesosVault: t.vaultIn - t.vaultOut,
    sxSharesFromEvents: t.sxSharesIn - t.sxSharesOut,
    netStocksCost: t.idxCost - t.idxProceeds,
    stocksFromEvents: t.idxIn - t.idxOut,
  };
}

function scan(wallet: Address): Promise<State> {
  const a = serverAddresses();
  const key = `${a.protocol}:${wallet.toLowerCase()}`;
  const prev = cache.get(key);
  if (prev && Date.now() - prev.at < MIN_INTERVAL_MS) return Promise.resolve(prev);
  const running = inflight.get(key);
  if (running) return running; // concurrent callers share one scan
  const p = doScan(wallet, prev)
    .then((st) => (cache.set(key, st), st))
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function doScan(wallet: Address, prev: State | undefined): Promise<State> {
  const a = serverAddresses();
  const sOUSD = vaultAddress("sOUSD");
  const sxMXN = vaultAddress("sxMXN");
  const desk = a.protocol === "v2" ? a.investDesk : undefined;
  const deskIdx = a.protocol === "v2" ? a.investDeskIdx : undefined;
  // once sxMXN exists, peso savings is the vault and pool deposits are lending to drivers (Crédito's lenders)
  const POOL_IN = sxMXN ? "Depósito · préstamo a choferes" : "Depósito · ahorro en pesos";
  const POOL_OUT = sxMXN ? "Retiro · préstamo a choferes" : "Retiro · ahorro en pesos";

  // work on a copy: a failed scan must not leave a half-applied state in the cache
  const st: State = prev
    ? { next: prev.next, at: 0, rows: [...prev.rows], t: { ...prev.t } }
    : {
        next: BigInt(a.startBlock),
        at: 0,
        rows: [],
        t: Object.fromEntries(TOTALS.map((k) => [k, 0n])) as State["t"],
      };
  const t = st.t;
  type L = { transactionHash: `0x${string}`; blockNumber: bigint; logIndex: number; blockTimestamp?: unknown };
  const push = (l: L, product: InvestRow["product"], label: string, amount: bigint, symbol: string) =>
    st.rows.push({
      product,
      label,
      amount,
      symbol,
      txHash: l.transactionHash,
      block: l.blockNumber,
      logIndex: l.logIndex,
      timestamp:
        l.blockTimestamp === undefined || l.blockTimestamp === null
          ? undefined
          : Number(BigInt(l.blockTimestamp as string | bigint | number)),
    });

  const c = publicClient();
  const latest = await c.getBlockNumber();
  for (let from = st.next; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
    const range = { fromBlock: from, toBlock: to, strict: true } as const;
    // sequential on purpose: one request at a time (the client retries 429s with backoff)
    for (const l of await c.getLogs({ address: a.creditPool, event: supplied, args: { lender: wallet }, ...range })) {
      t.pesosIn += l.args.amount;
      push(l, "pesos", POOL_IN, l.args.amount, "xMXN");
    }
    for (const l of await c.getLogs({ address: a.creditPool, event: withdrawn, args: { lender: wallet }, ...range })) {
      t.pesosOut += l.args.amount;
      push(l, "pesos", POOL_OUT, l.args.amount, "xMXN");
    }
    if (sOUSD) {
      for (const l of await c.getLogs({ address: sOUSD, event: depositEv, args: { owner: wallet }, ...range })) {
        t.dolIn += l.args.assets;
        t.sharesIn += l.args.shares;
        push(l, "dolares", "Depósito · ahorro en dólares", l.args.assets, "OUSD");
      }
      for (const l of await c.getLogs({ address: sOUSD, event: withdrawEv, args: { owner: wallet }, ...range })) {
        t.dolOut += l.args.assets;
        t.sharesOut += l.args.shares;
        push(l, "dolares", "Retiro · ahorro en dólares", l.args.assets, "OUSD");
      }
    }
    if (desk) {
      for (const l of await c.getLogs({ address: desk, event: bought, args: { user: wallet }, ...range })) {
        t.tbCost += l.args.ousdUsed;
        t.tbIn += l.args.tbillOut;
        push(l, "tbills", "Compra · T-bills", l.args.tbillOut, "tTBILL");
      }
      for (const l of await c.getLogs({ address: desk, event: sold, args: { user: wallet }, ...range })) {
        t.tbProceeds += l.args.ousdOut;
        t.tbOut += l.args.tbillIn;
        push(l, "tbills", "Venta · T-bills", l.args.tbillIn, "tTBILL");
      }
    }
    if (sxMXN) {
      for (const l of await c.getLogs({ address: sxMXN, event: depositEv, args: { owner: wallet }, ...range })) {
        t.vaultIn += l.args.assets;
        t.sxSharesIn += l.args.shares;
        push(l, "pesos", "Depósito · ahorro en pesos", l.args.assets, "xMXN");
      }
      for (const l of await c.getLogs({ address: sxMXN, event: withdrawEv, args: { owner: wallet }, ...range })) {
        t.vaultOut += l.args.assets;
        t.sxSharesOut += l.args.shares;
        push(l, "pesos", "Retiro · ahorro en pesos", l.args.assets, "xMXN");
      }
    }
    if (deskIdx) {
      for (const l of await c.getLogs({ address: deskIdx, event: bought, args: { user: wallet }, ...range })) {
        t.idxCost += l.args.ousdUsed;
        t.idxIn += l.args.tbillOut;
        push(l, "acciones", "Compra · acciones", l.args.tbillOut, "mIDX");
      }
      for (const l of await c.getLogs({ address: deskIdx, event: sold, args: { user: wallet }, ...range })) {
        t.idxProceeds += l.args.ousdOut;
        t.idxOut += l.args.tbillIn;
        push(l, "acciones", "Venta · acciones", l.args.tbillIn, "mIDX");
      }
    }
    st.next = to + 1n;
  }
  st.rows.sort((x, y) => (x.block === y.block ? y.logIndex - x.logIndex : x.block > y.block ? -1 : 1));
  st.at = Date.now();
  return st;
}
