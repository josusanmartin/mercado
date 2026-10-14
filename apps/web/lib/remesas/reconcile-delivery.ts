// R-039: decide whether converted-but-undelivered pesos may be (re)delivered. Pure, no React, no aliases.
import { parseAbiItem, stringToHex, type Address, type Hex } from "viem";

/**
 * Converted pesos that haven't (provably) reached the recipient. Persisted per sender (R-039) from the
 * moment the conversion confirms in a two-step flow (v1 swap+send, v2 mint-to-self+transferWithMemo),
 * and removed only once a delivery is confirmed. Records what's needed to reconcile after a reload:
 * the chain and token, the conversion hash and block, and the hash of any delivery already broadcast.
 */
export type Stranded = {
  account: Address;
  to: Address;
  amount: bigint;
  memo?: string;
  chainId: number;
  token: Address;
  convertHash?: Hex;
  /** With no recorded delivery tx, deliveries are searched for in logs from this block (the conversion's). */
  fromBlock?: string;
  /** A delivery tx already broadcast (receipt not seen yet), with what proves it can or can't still land. */
  delivery?: Delivery;
};
export type Delivery = {
  hash: Hex;
  at: number;
  /** Learned from the node while it knows the tx: its sequence nonce (and 2D nonce key) and expiry. */
  nonce?: string;
  nonceKey?: string;
  validBefore?: number;
};

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 amount)");
const TRANSFER_MEMO = parseAbiItem("event TransferWithMemo(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo)");
const LOG_CHUNK = 50_000n;

type Log = { args: { amount?: bigint; memo?: Hex }; transactionHash: Hex | null };
type Tx = { nonce?: number | bigint; nonceKey?: bigint | string | null; validBefore?: number | bigint | null; blockNumber?: bigint | null };
/** The read calls reconcile() needs (a viem public client satisfies it). */
export type ReconcileClient = {
  getBlockNumber(): Promise<bigint>;
  getBlock(): Promise<{ timestamp: bigint }>;
  getLogs(args: { address: Address; event: unknown; fromBlock: bigint; toBlock: bigint; args: { from: Address; to: Address } }): Promise<Log[]>;
  getTransactionReceipt(args: { hash: Hex }): Promise<{ status: string }>;
  getTransaction(args: { hash: Hex }): Promise<Tx>;
  getTransactionCount(args: { address: Address; blockTag: "latest" }): Promise<number>;
};
export type Reconciled =
  | { state: "delivered"; hash: Hex }
  | { state: "pending"; learned?: Partial<Delivery> }
  | { state: "clear" };

/** viem raises a *NotFoundError for a null receipt/tx. Only that means "the node doesn't have it"; any other
 *  failure (429, timeout, network) is UNKNOWN and propagates, so it can never authorize a resend (CR-01). */
async function orNotFound<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch (e) {
    if (e instanceof Error && /NotFoundError$/.test(e.name)) return undefined;
    throw e;
  }
}

/** What the node says about a tx that proves (or not) whether it can still land. */
export function learnFrom(tx: Tx): Partial<Delivery> {
  const out: Partial<Delivery> = {};
  if (tx.nonce !== undefined) out.nonce = BigInt(tx.nonce).toString();
  if (tx.nonceKey !== undefined && tx.nonceKey !== null) out.nonceKey = BigInt(tx.nonceKey).toString();
  if (tx.validBefore !== undefined && tx.validBefore !== null) out.validBefore = Number(tx.validBefore);
  return out;
}

/**
 * Before any (re)delivery (CR-01, exact; no timers):
 *  A recorded delivery tx is decided ONLY by its own hash: success receipt → delivered; reverted → clear;
 *  known to the node → pending. Unknown to the node, it clears only when it provably can never land: its
 *  sequence nonce (2D key 0) was consumed by another tx, or its validBefore has passed (each re-checked
 *  against the receipt to close the race with it being mined). Otherwise it stays pending, forever if need be.
 *  No recorded delivery: an actual transfer of exactly that amount, sender → recipient, with exactly that memo
 *  (or a plain transfer when there is none) since the conversion block, confirmed by a success receipt.
 *  Any RPC failure throws.
 */
export async function reconcile(client: ReconcileClient, s: Stranded): Promise<Reconciled> {
  const d = s.delivery;
  if (d) {
    const settled = async (): Promise<Reconciled | undefined> => {
      const r = await orNotFound(() => client.getTransactionReceipt({ hash: d.hash }));
      return r ? (r.status === "success" ? { state: "delivered", hash: d.hash } : { state: "clear" }) : undefined;
    };
    const first = await settled();
    if (first) return first;
    const tx = await orNotFound(() => client.getTransaction({ hash: d.hash }));
    if (tx) return { state: "pending", learned: learnFrom(tx) };
    const info = d.nonce !== undefined ? d : undefined;
    if (info && (info.nonceKey ?? "0") === "0") {
      const count = await client.getTransactionCount({ address: s.account, blockTag: "latest" });
      if (BigInt(count) > BigInt(info.nonce!)) return (await settled()) ?? { state: "clear" };
    }
    if (d.validBefore !== undefined) {
      const b = await client.getBlock();
      if (Number(b.timestamp) >= d.validBefore) return (await settled()) ?? { state: "clear" };
    }
    return { state: "pending" };
  }

  if (s.fromBlock === undefined) return { state: "clear" };
  const memo32 = s.memo ? stringToHex(s.memo, { size: 32 }).toLowerCase() : undefined;
  const latest = await client.getBlockNumber();
  for (let from = BigInt(s.fromBlock); from <= latest; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n < latest ? from + LOG_CHUNK - 1n : latest;
    const q = { address: s.token, fromBlock: from, toBlock: to, args: { from: s.account, to: s.to } } as const;
    const logs = memo32
      ? (await client.getLogs({ ...q, event: TRANSFER_MEMO })).filter((l) => l.args.memo?.toLowerCase() === memo32)
      : await client.getLogs({ ...q, event: TRANSFER });
    for (const l of logs) {
      if (l.args.amount !== s.amount || !l.transactionHash) continue;
      const r = await orNotFound(() => client.getTransactionReceipt({ hash: l.transactionHash! }));
      if (r?.status === "success") return { state: "delivered", hash: l.transactionHash };
    }
  }
  return { state: "clear" };
}
