// R-039: decide whether converted-but-undelivered pesos may be (re)delivered. Pure, no React, no aliases.
import { parseAbiItem, type Address, type Hex } from "viem";

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
  /** Deliveries are searched for in Transfer logs from this block on (the conversion's block). */
  fromBlock?: string;
  /** A delivery tx already broadcast (receipt not seen yet). */
  delivery?: { hash: Hex; at: number };
};
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 amount)");
const TRANSFER_MEMO = parseAbiItem("event TransferWithMemo(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo)");
const LOG_CHUNK = 50_000n;
/** A broadcast delivery the node has never heard of after this long was dropped: safe to send again. */
const DROPPED_AFTER_MS = 10 * 60_000;

/** The read calls reconcile() needs (a viem public client satisfies it). */
export type ReconcileClient = {
  getBlockNumber(): Promise<bigint>;
  getLogs(args: { address: Address; event: unknown; fromBlock: bigint; toBlock: bigint; args: { from: Address; to: Address } }): Promise<{ args: { amount?: bigint }; transactionHash: Hex | null }[]>;
  getTransactionReceipt(args: { hash: Hex }): Promise<{ status: string }>;
  getTransaction(args: { hash: Hex }): Promise<unknown>;
};
export type Reconciled = { state: "delivered"; hash: Hex } | { state: "pending" } | { state: "clear" };

/**
 * Before any (re)delivery: did the pesos already arrive? 1) an actual Transfer of exactly that amount
 * from the sender to the recipient since the conversion block; 2) the recorded delivery tx: success →
 * delivered, reverted → clear, known but unmined → pending, unknown → pending until it is provably
 * dropped. Unknown settlement is never treated as "not delivered".
 */
export async function reconcile(client: ReconcileClient, s: Stranded): Promise<Reconciled> {
  if (s.fromBlock !== undefined) {
    const latest = await client.getBlockNumber();
    for (let from = BigInt(s.fromBlock); from <= latest; from += LOG_CHUNK) {
      const to = from + LOG_CHUNK - 1n < latest ? from + LOG_CHUNK - 1n : latest;
      const q = { address: s.token, fromBlock: from, toBlock: to, args: { from: s.account, to: s.to } } as const;
      const [a, b] = await Promise.all([client.getLogs({ ...q, event: TRANSFER }), client.getLogs({ ...q, event: TRANSFER_MEMO })]);
      const hit = [...a, ...b].find((l) => l.args.amount === s.amount);
      if (hit) return { state: "delivered", hash: hit.transactionHash as Hex };
    }
  }
  if (s.delivery) {
    const r = await client.getTransactionReceipt({ hash: s.delivery.hash }).catch(() => undefined);
    if (r) return r.status === "success" ? { state: "delivered", hash: s.delivery.hash } : { state: "clear" };
    const known = await client.getTransaction({ hash: s.delivery.hash }).catch(() => undefined);
    if (known || Date.now() - s.delivery.at < DROPPED_AFTER_MS) return { state: "pending" };
  }
  return { state: "clear" };
}

