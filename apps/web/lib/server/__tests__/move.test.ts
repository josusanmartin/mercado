// MOVE quotes: math, labels and error mapping (chain reads stubbed; no testnet calls).
import { describe, expect, it, vi } from "vitest";
import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { swapDeskAbi } from "@mercado/shared";

const ADDR = {
  ousd: "0x20c0000000000000000000006a37DA5C996874BE",
  xMXN: "0x20C0000000000000000000002486D8487268a6dd",
  oracle: "0x00000000000000000000000000000000000000a1",
  swapDesk: "0x00000000000000000000000000000000000000d1",
} as const;
const V2 = {
  vamm: "0x00000000000000000000000000000000000000e1",
  xMXN: "0x00000000000000000000000000000000000000e3",
} as const;

// The active protocol's addresses (stand-in for packages/shared/src/protocol.ts activeAddresses()).
let active: Record<string, unknown> | Error = { protocol: "v1", chainId: 42431, ...ADDR };
vi.mock("../protocol", async (importOriginal) => {
  const real = await importOriginal<typeof import("../protocol")>();
  const serverAddresses = () => {
    if (active instanceof Error) throw new real.ProtocolUnavailableError(active.message);
    return active;
  };
  return {
    ...real,
    serverAddresses,
    requireAddress: (k: string) => {
      const v = (serverAddresses() as Record<string, unknown>)[k];
      if (typeof v !== "string") throw new real.ProtocolUnavailableError(`no ${k}`);
      return v;
    },
  };
});

let px = 2_000_000_000n; // 20.00 MXN/USD
let deskImpl: (args: readonly unknown[]) => unknown = ([usdToMxn, amountIn]) => {
  const a = amountIn as bigint;
  const gross = usdToMxn ? (a * px) / 100_000_000n : (a * 100_000_000n) / px;
  const fee = (gross * 50n + 9_999n) / 10_000n;
  return [gross - fee, fee];
};
vi.mock("../chain", () => ({
  publicClient: () => ({
    readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (functionName === "peek") return [px, 1n, true];
      if (functionName === "isMock") return true;
      if (functionName === "quote") return deskImpl(args ?? []);
      throw new Error("unexpected " + functionName);
    },
  }),
}));

import { MoveQuoteError, quoteMove } from "../move/quote";

describe("MOVE quotes (v1 SwapDesk fallback)", () => {
  it("usd_to_mxn: 100 OUSD at 20.00 with a 50 bps spread", async () => {
    const q = await quoteMove("usd_to_mxn", "100", 1_000);
    expect(q.source).toBe("v1-swapdesk");
    expect(q.amountIn).toBe("100000000");
    expect(q.amountOut).toBe("1990000000"); // 2,000 − 10 fee
    expect(q.fee).toBe("10000000");
    expect(q.rate).toBeCloseTo(19.9, 6);
    expect(q.oracleMidRate).toBe(20);
    expect(q.effectiveSpreadBps).toBe(50);
    expect(q.feeBps).toBe(50);
    expect(q.sizeImpactBps).toBe(0);
    expect(q.minOutSuggested).toBe("1980050000");
    expect(q.expiresAt).toBe(1_030);
    expect(q.firm).toBe(false);
    expect(q.isMock).toBe(true);
    expect(q.label).toMatch(/mock FX feed/);
    expect(q.symbolIn).toBe("OUSD");
  });

  it("mxn_to_usd: 2,000 xMXN", async () => {
    const q = await quoteMove("mxn_to_usd", "2000", 1_000);
    expect(q.amountOut).toBe("99500000");
    expect(q.symbolOut).toBe("OUSD");
    expect(q.effectiveSpreadBps).toBe(50);
  });

  it("maps venue reverts to readable 422s", async () => {
    const prev = deskImpl;
    deskImpl = () => {
      const data = encodeErrorResult({ abi: swapDeskAbi, errorName: "SwapTooLarge", args: [11_000_000_000n, 10_000_000_000n] });
      throw new BaseError("revert", { cause: new ContractFunctionRevertedError({ abi: swapDeskAbi, data, functionName: "quote" }) });
    };
    await expect(quoteMove("usd_to_mxn", "900")).rejects.toMatchObject({ status: 422, code: "SwapTooLarge" });
    deskImpl = prev;
  });

  it("rejects zero, and fails closed when the active protocol lacks a venue", async () => {
    await expect(quoteMove("usd_to_mxn", "0")).rejects.toBeInstanceOf(MoveQuoteError);
    const { ProtocolUnavailableError } = await import("../protocol");
    active = { protocol: "v1", chainId: 42431, ousd: ADDR.ousd, xMXN: ADDR.xMXN, oracle: ADDR.oracle };
    await expect(quoteMove("usd_to_mxn", "1")).rejects.toBeInstanceOf(ProtocolUnavailableError);
    active = { protocol: "v1", chainId: 42431, ...ADDR };
  });
});

describe("MOVE quotes (v2 vAMM)", () => {
  it("uses only v2 venue + token when v2 is active, and reports size impact", async () => {
    active = { protocol: "v2", chainId: 42431, ousd: ADDR.ousd, oracle: ADDR.oracle, ...V2 };
    const prev = deskImpl;
    deskImpl = () => [1_985_000_000n, 6_000_000n, 2_000_000_000n, 15n]; // out, fee, mid, impactBps
    const q = await quoteMove("usd_to_mxn", "100", 1_000);
    expect(q.protocol).toBe("v2");
    expect(q.source).toBe("v2-vamm");
    expect(q.venue).toBe(V2.vamm);
    expect(q.tokenOut).toBe(V2.xMXN);
    expect(q.sizeImpactBps).toBe(15);
    expect(q.effectiveSpreadBps).toBe(75);
    deskImpl = prev;
    active = { protocol: "v1", chainId: 42431, ...ADDR };
  });

  it("fails closed when v2 is selected but incomplete (never falls back to v1)", async () => {
    const { ProtocolUnavailableError } = await import("../protocol");
    active = new Error("Mercado v2 is selected but deployments.v2 is missing or incomplete.");
    await expect(quoteMove("usd_to_mxn", "100")).rejects.toBeInstanceOf(ProtocolUnavailableError);
    active = { protocol: "v2", chainId: 42431, ousd: ADDR.ousd, oracle: ADDR.oracle, xMXN: V2.xMXN }; // no vamm
    await expect(quoteMove("usd_to_mxn", "100")).rejects.toBeInstanceOf(ProtocolUnavailableError);
    active = { protocol: "v1", chainId: 42431, ...ADDR };
  });

  it("never falls back to v1 when the v2 venue read fails", async () => {
    active = { protocol: "v2", chainId: 42431, ousd: ADDR.ousd, oracle: ADDR.oracle, ...V2 };
    const prev = deskImpl;
    deskImpl = () => {
      throw new Error("rpc down");
    };
    await expect(quoteMove("usd_to_mxn", "100")).rejects.toMatchObject({ status: 502 });
    deskImpl = prev;
    active = { protocol: "v1", chainId: 42431, ...ADDR };
  });
});
