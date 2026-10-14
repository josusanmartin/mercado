// R-039: never re-deliver converted pesos while an earlier delivery may have landed or may still land.
import { describe, expect, it } from "vitest";
import { reconcile, type ReconcileClient, type Stranded } from "../reconcile-delivery";

const ME = "0x1111111111111111111111111111111111111111" as const;
const MOM = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x20C0000000000000000000004fE3A8219136ca54" as const;
const H = "0xaaaa000000000000000000000000000000000000000000000000000000000000" as const;
const base: Stranded = { account: ME, to: MOM, amount: 918_350_000n, memo: "para mamá", chainId: 42431, token: TOKEN, convertHash: H, fromBlock: "100" };

function fake(o: { latest?: bigint; logs?: { amount: bigint; hash: `0x${string}`; memo?: boolean }[]; receipt?: "success" | "reverted"; known?: boolean }): ReconcileClient & { ranges: [bigint, bigint][] } {
  const ranges: [bigint, bigint][] = [];
  return {
    ranges,
    getBlockNumber: async () => o.latest ?? 200n,
    getLogs: async ({ event, fromBlock, toBlock, args }) => {
      ranges.push([fromBlock, toBlock]);
      expect(args).toEqual({ from: ME, to: MOM });
      const memoEvent = (event as { name: string }).name === "TransferWithMemo";
      return (o.logs ?? []).filter((l) => !!l.memo === memoEvent).map((l) => ({ args: { amount: l.amount }, transactionHash: l.hash }));
    },
    getTransactionReceipt: async () => {
      if (!o.receipt) throw new Error("not found");
      return { status: o.receipt };
    },
    getTransaction: async () => {
      if (!o.known) throw new Error("not found");
      return {};
    },
  };
}

describe("reconcile", () => {
  it("finds a delivery by its log (memo transfer), even with no recorded hash", async () => {
    const r = await reconcile(fake({ logs: [{ amount: base.amount, hash: H, memo: true }] }), base);
    expect(r).toEqual({ state: "delivered", hash: H });
  });
  it("ignores transfers of a different amount", async () => {
    expect(await reconcile(fake({ logs: [{ amount: 1n, hash: H }] }), base)).toEqual({ state: "clear" });
  });
  it("scans in ≤50k-block chunks from the conversion block to latest", async () => {
    const c = fake({ latest: 120_100n });
    await reconcile(c, base);
    expect(c.ranges.filter((_, i) => i % 2 === 0)).toEqual([
      [100n, 50_099n],
      [50_100n, 100_099n],
      [100_100n, 120_100n],
    ]);
  });
  it("broadcast + mined successfully → delivered (never re-sent)", async () => {
    expect(await reconcile(fake({ receipt: "success" }), { ...base, delivery: { hash: H, at: Date.now() } })).toEqual({ state: "delivered", hash: H });
  });
  it("broadcast + reverted → clear to deliver", async () => {
    expect(await reconcile(fake({ receipt: "reverted" }), { ...base, delivery: { hash: H, at: Date.now() } })).toEqual({ state: "clear" });
  });
  it("broadcast, no receipt, node knows the tx → pending, even long after", async () => {
    expect(await reconcile(fake({ known: true }), { ...base, delivery: { hash: H, at: 0 } })).toEqual({ state: "pending" });
  });
  it("broadcast, no receipt, node doesn't know it yet → pending inside the drop window", async () => {
    expect(await reconcile(fake({}), { ...base, delivery: { hash: H, at: Date.now() - 60_000 } })).toEqual({ state: "pending" });
  });
  it("broadcast, unknown to the node for 10+ minutes, no log → dropped, clear", async () => {
    expect(await reconcile(fake({}), { ...base, delivery: { hash: H, at: Date.now() - 11 * 60_000 } })).toEqual({ state: "clear" });
  });
  it("an RPC failure is not 'not delivered': it throws instead of clearing", async () => {
    const c = fake({});
    c.getLogs = async () => {
      throw new Error("rpc down");
    };
    await expect(reconcile(c, base)).rejects.toThrow("rpc down");
  });
});
