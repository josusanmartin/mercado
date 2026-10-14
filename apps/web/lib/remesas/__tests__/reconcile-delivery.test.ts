// R-039 / CR-01: never re-deliver converted pesos unless the earlier delivery provably did not and cannot land.
import { stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import { reconcile, type ReconcileClient, type Stranded } from "../reconcile-delivery";

const ME = "0x1111111111111111111111111111111111111111" as const;
const MOM = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x20C0000000000000000000004fE3A8219136ca54" as const;
const H = "0xaaaa000000000000000000000000000000000000000000000000000000000000" as const;
const OTHER = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const MEMO = stringToHex("para mamá", { size: 32 });
const base: Stranded = { account: ME, to: MOM, amount: 918_350_000n, memo: "para mamá", chainId: 42431, token: TOKEN, convertHash: H, fromBlock: "100" };
const pending = (extra: Partial<NonNullable<Stranded["delivery"]>> = {}): Stranded => ({ ...base, delivery: { hash: H, at: 0, ...extra } });

const notFound = (name: string) => Object.assign(new Error("not found"), { name });
type Opts = {
  latest?: bigint;
  logs?: { amount: bigint; hash: `0x${string}`; memo?: `0x${string}` }[];
  receipts?: Record<string, "success" | "reverted" | "error">;
  tx?: "known" | "error";
  txInfo?: { nonce: number; nonceKey?: bigint; validBefore?: number };
  count?: number;
  blockTs?: number;
  /** receipt appears on the Nth lookup (simulates being mined mid-reconcile) */
  receiptOnCall?: number;
};
function fake(o: Opts) {
  const ranges: [bigint, bigint][] = [];
  let receiptCalls = 0;
  const c: ReconcileClient & { ranges: typeof ranges } = {
    ranges,
    getBlockNumber: async () => o.latest ?? 200n,
    getBlock: async () => ({ timestamp: BigInt(o.blockTs ?? 0) }),
    getLogs: async ({ event, fromBlock, toBlock, args }) => {
      ranges.push([fromBlock, toBlock]);
      expect(args).toEqual({ from: ME, to: MOM });
      const memoEvent = (event as { name: string }).name === "TransferWithMemo";
      return (o.logs ?? []).filter((l) => !!l.memo === memoEvent).map((l) => ({ args: { amount: l.amount, memo: l.memo }, transactionHash: l.hash }));
    },
    getTransactionReceipt: async ({ hash }) => {
      receiptCalls++;
      const r = o.receipts?.[hash] ?? (o.receiptOnCall && receiptCalls >= o.receiptOnCall ? "success" : undefined);
      if (r === "error") throw new Error("HTTP 429");
      if (!r) throw notFound("TransactionReceiptNotFoundError");
      return { status: r };
    },
    getTransaction: async () => {
      if (o.tx === "error") throw new Error("timeout");
      if (o.tx !== "known") throw notFound("TransactionNotFoundError");
      return { nonce: o.txInfo?.nonce ?? 6, nonceKey: o.txInfo?.nonceKey ?? 0n, validBefore: o.txInfo?.validBefore ?? null };
    },
    getTransactionCount: async () => o.count ?? 0,
  };
  return c;
}

describe("reconcile: a recorded delivery is decided only by its own hash", () => {
  it("success receipt → delivered", async () => {
    expect(await reconcile(fake({ receipts: { [H]: "success" } }), pending())).toEqual({ state: "delivered", hash: H });
  });
  it("reverted receipt → clear", async () => {
    expect(await reconcile(fake({ receipts: { [H]: "reverted" } }), pending())).toEqual({ state: "clear" });
  });
  it("known to the node, unmined → pending, and learns its nonce", async () => {
    expect(await reconcile(fake({ tx: "known", txInfo: { nonce: 6 } }), pending())).toEqual({ state: "pending", learned: { nonce: "6", nonceKey: "0" } });
  });
  it("review probe: receipt/tx reads throw 429/timeout after 11 min → throws, never clear", async () => {
    await expect(reconcile(fake({ receipts: { [H]: "error" } }), pending())).rejects.toThrow("429");
    await expect(reconcile(fake({ tx: "error" }), pending())).rejects.toThrow("timeout");
  });
  it("review probe: a same-amount unrelated transfer does NOT resolve a known pending hash", async () => {
    const r = await reconcile(fake({ tx: "known", logs: [{ amount: base.amount, hash: OTHER, memo: MEMO }], receipts: { [OTHER]: "success" } }), pending());
    expect(r.state).toBe("pending");
  });
  it("unknown to the node with no proof (no nonce, no expiry) → pending, however old", async () => {
    expect(await reconcile(fake({}), pending({ at: 0 }))).toEqual({ state: "pending" });
  });
  it("unknown, nonce consumed by another tx → clear (can never land)", async () => {
    expect(await reconcile(fake({ count: 7 }), pending({ nonce: "6", nonceKey: "0" }))).toEqual({ state: "clear" });
  });
  it("unknown, nonce not yet consumed → pending", async () => {
    expect(await reconcile(fake({ count: 6 }), pending({ nonce: "6", nonceKey: "0" }))).toEqual({ state: "pending" });
  });
  it("nonce consumed because OUR tx was just mined → delivered, not clear (receipt re-check)", async () => {
    expect(await reconcile(fake({ count: 7, receiptOnCall: 2 }), pending({ nonce: "6", nonceKey: "0" }))).toEqual({ state: "delivered", hash: H });
  });
  it("a 2D nonce key ≠ 0 can't be proven via the sequence nonce → pending", async () => {
    expect(await reconcile(fake({ count: 99 }), pending({ nonce: "6", nonceKey: "5" }))).toEqual({ state: "pending" });
  });
  it("unknown and past validBefore → clear; before it → pending", async () => {
    expect(await reconcile(fake({ blockTs: 2000 }), pending({ validBefore: 1000 }))).toEqual({ state: "clear" });
    expect(await reconcile(fake({ blockTs: 500 }), pending({ validBefore: 1000 }))).toEqual({ state: "pending" });
  });
});

describe("reconcile: no recorded delivery → exact transfer since the conversion", () => {
  it("exact amount + exact memo + success receipt → delivered", async () => {
    expect(await reconcile(fake({ logs: [{ amount: base.amount, hash: OTHER, memo: MEMO }], receipts: { [OTHER]: "success" } }), base)).toEqual({ state: "delivered", hash: OTHER });
  });
  it("same amount, different memo → not this delivery", async () => {
    const other = stringToHex("para papá", { size: 32 });
    expect(await reconcile(fake({ logs: [{ amount: base.amount, hash: OTHER, memo: other }], receipts: { [OTHER]: "success" } }), base)).toEqual({ state: "clear" });
  });
  it("different amount → clear", async () => {
    expect(await reconcile(fake({ logs: [{ amount: 1n, hash: OTHER, memo: MEMO }], receipts: { [OTHER]: "success" } }), base)).toEqual({ state: "clear" });
  });
  it("no memo: only plain transfers count", async () => {
    const s = { ...base, memo: undefined };
    expect(await reconcile(fake({ logs: [{ amount: s.amount, hash: OTHER, memo: MEMO }], receipts: { [OTHER]: "success" } }), s)).toEqual({ state: "clear" });
    expect(await reconcile(fake({ logs: [{ amount: s.amount, hash: OTHER }], receipts: { [OTHER]: "success" } }), s)).toEqual({ state: "delivered", hash: OTHER });
  });
  it("scans in ≤50k-block chunks from the conversion block to latest", async () => {
    const c = fake({ latest: 120_100n });
    await reconcile(c, base);
    expect(c.ranges).toEqual([
      [100n, 50_099n],
      [50_100n, 100_099n],
      [100_100n, 120_100n],
    ]);
  });
  it("an RPC failure throws instead of clearing", async () => {
    const c = fake({});
    c.getLogs = async () => {
      throw new Error("rpc down");
    };
    await expect(reconcile(c, base)).rejects.toThrow("rpc down");
  });
});
