// Back office data for Mercado Crédito, all real:
//  - attestation ledger: every eligibility attestation the API signed (recorded at signing time), with a
//    live "used on-chain" check (CreditPool.nonceUsed);
//  - loan book: CreditPool Borrowed / Repaid logs (getLogs), joined to the ledger by (borrower, nonce) for
//    the platform, with per-loan status derived FIFO from each borrower's repayments.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseAbiItem, type Address, type Hex } from "viem";
import {
  creditPoolAbi,
  type DriverPlatform,
  type DriverProfileId,
} from "@mercado/shared";
import { repoRoot } from "../env";
import { publicClient } from "../chain";
import { serverAddresses } from "../protocol";
import { withKeyLock } from "../bills/lock";

export interface AttestationRecord {
  at: string;
  protocol: "v1" | "v2";
  pool: Address;
  borrower: Address;
  platform: DriverPlatform;
  profile: DriverProfileId;
  score: number;
  maxAmount: string; // 6dp
  expiry: number;
  nonce: string;
  dataHash: Hex;
}

const ledgerFile = () =>
  process.env.MERCADO_ATTESTATIONS_FILE ??
  path.join(repoRoot(), ".data", "attestations.json");

function loadLedger(): AttestationRecord[] {
  const f = ledgerFile();
  return existsSync(f)
    ? (JSON.parse(readFileSync(f, "utf8")) as AttestationRecord[])
    : [];
}

export async function recordAttestation(rec: AttestationRecord) {
  await withKeyLock("attestation-ledger", async () => {
    const all = [rec, ...loadLedger()].slice(0, 1000);
    const f = ledgerFile();
    mkdirSync(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2));
    renameSync(tmp, f);
  });
}

/** Recent attestations for the active pool, each with whether its nonce has been used on-chain. */
export async function recentAttestations(limit = 20) {
  const { creditPool } = serverAddresses();
  const rows = loadLedger()
    .filter((r) => r.pool.toLowerCase() === creditPool.toLowerCase())
    .slice(0, limit);
  const used = await publicClient()
    .multicall({
      allowFailure: true,
      contracts: rows.map((r) => ({
        address: creditPool,
        abi: creditPoolAbi,
        functionName: "nonceUsed",
        args: [r.borrower, BigInt(r.nonce)],
      })),
    })
    .catch(() => rows.map(() => ({ status: "failure" as const })));
  return rows.map((r, i) => ({
    ...r,
    used:
      used[i]?.status === "success"
        ? ((used[i] as unknown as { result: boolean }).result ?? null)
        : null,
  }));
}

// ---------------------------------------------------------------- loan book

const borrowedEvt = parseAbiItem(
  "event Borrowed(address indexed borrower, uint256 amount, uint256 fee, uint256 nonce, bytes32 dataHash)",
);
const repaidEvt = parseAbiItem(
  "event Repaid(address indexed borrower, uint256 amount, uint256 remainingDebt)",
);
const CHUNK = 50_000n;

type Ev =
  | {
      kind: "borrow";
      borrower: Address;
      amount: bigint;
      fee: bigint;
      nonce: bigint;
      dataHash: Hex;
      tx: Hex;
      block: bigint;
      idx: number;
    }
  | {
      kind: "repay";
      borrower: Address;
      amount: bigint;
      remaining: bigint;
      tx: Hex;
      block: bigint;
      idx: number;
    };

const cache = new Map<
  string,
  { toBlock: bigint; events: Ev[]; times: Map<bigint, number> }
>();

async function poolEvents() {
  const a = serverAddresses();
  const client = publicClient();
  const key = `${a.protocol}:${a.creditPool}`;
  const c: { toBlock: bigint; events: Ev[]; times: Map<bigint, number> } =
    cache.get(key) ?? {
      toBlock: BigInt(a.startBlock) - 1n,
      events: [],
      times: new Map(),
    };
  const latest = await client.getBlockNumber();
  for (let from = c.toBlock + 1n; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
    const [b, r] = await Promise.all([
      client.getLogs({
        address: a.creditPool,
        event: borrowedEvt,
        fromBlock: from,
        toBlock: to,
        strict: true,
      }),
      client.getLogs({
        address: a.creditPool,
        event: repaidEvt,
        fromBlock: from,
        toBlock: to,
        strict: true,
      }),
    ]);
    for (const l of b)
      c.events.push({
        kind: "borrow" as const,
        borrower: l.args.borrower,
        amount: l.args.amount,
        fee: l.args.fee,
        nonce: l.args.nonce,
        dataHash: l.args.dataHash,
        tx: l.transactionHash,
        block: l.blockNumber,
        idx: l.logIndex,
      });
    for (const l of r)
      c.events.push({
        kind: "repay" as const,
        borrower: l.args.borrower,
        amount: l.args.amount,
        remaining: l.args.remainingDebt,
        tx: l.transactionHash,
        block: l.blockNumber,
        idx: l.logIndex,
      });
  }
  c.toBlock = latest;
  c.events.sort((x, y) =>
    x.block === y.block ? x.idx - y.idx : x.block < y.block ? -1 : 1,
  );
  // block timestamps for display (only blocks we haven't seen)
  const missing = [...new Set(c.events.map((e) => e.block))]
    .filter((b) => !c.times.has(b))
    .slice(-200);
  await Promise.all(
    missing.map(async (b) =>
      c.times.set(
        b,
        Number((await client.getBlock({ blockNumber: b })).timestamp),
      ),
    ),
  );
  cache.set(key, c);
  return c;
}

export interface LoanRow {
  borrower: Address;
  platform?: DriverPlatform;
  profile?: DriverProfileId;
  principal: string; // 6dp
  fee: string;
  repaid: string; // portion of principal+fee repaid (FIFO across the borrower's loans)
  status: "open" | "partially repaid" | "repaid";
  openedAt?: number;
  closedAt?: number;
  txHash: Hex;
}

export async function loanBook(limit = 25) {
  const { events, times } = await poolEvents();
  const ledger = new Map(
    loadLedger().map((r) => [`${r.borrower.toLowerCase()}:${r.nonce}`, r]),
  );
  const loans: (LoanRow & { owed: bigint; paid: bigint })[] = [];
  const queues = new Map<
    string,
    (LoanRow & { owed: bigint; paid: bigint })[]
  >();
  let repayments = 0;
  for (const e of events) {
    const who = e.borrower.toLowerCase();
    if (e.kind === "borrow") {
      const att = ledger.get(`${who}:${e.nonce}`);
      const row = {
        borrower: e.borrower,
        platform: att?.platform,
        profile: att?.profile,
        principal: e.amount.toString(),
        fee: e.fee.toString(),
        repaid: "0",
        status: "open" as LoanRow["status"],
        openedAt: times.get(e.block),
        txHash: e.tx,
        owed: e.amount + e.fee,
        paid: 0n,
      };
      loans.push(row);
      queues.set(who, [...(queues.get(who) ?? []), row]);
    } else {
      repayments++;
      let left = e.amount;
      for (const l of queues.get(who) ?? []) {
        if (left === 0n) break;
        const due = l.owed - l.paid;
        if (due === 0n) continue;
        const pay = left < due ? left : due;
        l.paid += pay;
        left -= pay;
        if (l.paid === l.owed) {
          l.status = "repaid";
          l.closedAt = times.get(e.block);
        } else l.status = "partially repaid";
      }
    }
  }
  const rows = loans
    .reverse()
    .slice(0, limit)
    .map(({ owed, paid, ...r }) => ({ ...r, repaid: paid.toString() }));
  return {
    loans: rows,
    totals: {
      loans: loans.length,
      repayments,
      open: loans.filter((l) => l.status !== "repaid").length,
      byPlatform: Object.fromEntries(
        (["uber", "didi", "rappi", "unknown"] as const).map((p) => [
          p,
          loans.filter((l) => (l.platform ?? "unknown") === p).length,
        ]),
      ),
    },
  };
}
