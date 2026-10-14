"use client";
// Stocks for the Invest phone (mobile2): mIDX "Mercado US Equity Index", a demo token priced by an owner feed,
// bought/sold against the Stocks InvestDesk (ADDR.investDeskIdx, same contract as the T-bill desk). Guards are
// api's from the T-bill flow: a paused/unknown desk is closed (R-043), sell max = min(balance, personal
// buy-back allowance), minOut = quote − 0.5% slippage. The 24h change comes from GET /api/invest/rates.
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, type Abi, type Address } from "viem";
import { useConfig, useConnection, useReadContract, useReadContracts } from "wagmi";
import { readContract } from "wagmi/actions";
import { investDeskAbi, priceFeedAbi } from "@mercado/shared";
import { ADDR, CHAIN_ID, COLLATERALS, useInvestDesk, useTx, withSlippage, type TxApi } from "@/lib/contracts";

const MIDX = COLLATERALS.find((c) => c.symbol === "mIDX");
const DESK = ADDR.investDeskIdx;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
export const STOCKS_DEPLOYED = !!MIDX?.feed && DESK !== ZERO;

type Rates = { stocks: { price: number; change24hPct: number | null; changeSinceFirstPct: number | null } | null };

export function useStocks() {
  const { address } = useConnection();
  const q = useReadContracts({
    contracts: MIDX?.feed
      ? ([
          { address: MIDX.token, abi: erc20Abi, functionName: "balanceOf", args: [address ?? ZERO], chainId: CHAIN_ID },
          { address: MIDX.feed, abi: priceFeedAbi, functionName: "peek", chainId: CHAIN_ID },
        ] as const)
      : [],
    query: { enabled: STOCKS_DEPLOYED, refetchInterval: 10_000 },
  });
  const d = q.data as { status: string; result?: unknown }[] | undefined;
  const balance = address && d?.[0]?.status === "success" ? (d[0].result as bigint) : undefined;
  const peek = d?.[1]?.status === "success" ? (d[1].result as readonly [bigint, bigint, boolean]) : undefined;
  const px8 = peek?.[0];
  const desk = useInvestDesk(undefined, DESK);
  const rates = useQuery({
    queryKey: ["invest-rates"],
    queryFn: () => fetch("/api/invest/rates").then((r) => r.json() as Promise<Rates>),
    refetchInterval: 30_000,
    enabled: STOCKS_DEPLOYED,
  });
  const s = rates.data?.stocks;
  const sellable = balance !== undefined && desk.sellableTbill !== undefined ? (balance < desk.sellableTbill ? balance : desk.sellableTbill) : undefined;
  return {
    balance,
    px8,
    value: balance !== undefined && px8 !== undefined ? (balance * px8) / 100_000_000n : undefined,
    /** % change (24h, or since the feed's first price while it's younger than a day), or undefined. */
    change: s ? (s.change24hPct ?? s.changeSinceFirstPct ?? undefined) : undefined,
    change24h: s?.change24hPct !== null && s?.change24hPct !== undefined,
    spreadBps: desk.spreadBps,
    reserve: desk.reserveTbill,
    /** R-043: a paused (or unread) desk is closed. */
    closed: !STOCKS_DEPLOYED || desk.paused !== false,
    sellable,
  };
}

export function useStocksQuote(side: "buy" | "sell", amountIn: bigint) {
  const q = useReadContract({
    address: DESK,
    abi: investDeskAbi,
    functionName: side === "buy" ? "quoteBuy" : "quoteSell",
    args: [amountIn],
    chainId: CHAIN_ID,
    query: { enabled: STOCKS_DEPLOYED && amountIn > 0n, retry: false, refetchInterval: 10_000 },
  });
  const r = q.data as readonly [bigint, bigint, bigint] | undefined;
  return { ...q, out: r?.[0] };
}

export function useStocksActions() {
  const config = useConfig();
  const tx = useTx();
  const approve = useCallback(
    async (t: TxApi, token: Address, amount: bigint, symbol: string) => {
      const allowance = await readContract(config, { address: token, abi: erc20Abi, functionName: "allowance", args: [t.account, DESK], chainId: CHAIN_ID });
      if (allowance < amount) await t.write({ address: token, abi: erc20Abi as Abi, functionName: "approve", args: [DESK, amount] }, `Aprobar ${symbol}`);
    },
    [config],
  );
  return {
    tx,
    buy: (ousdIn: bigint, quotedOut: bigint) =>
      tx.run(async (t) => {
        if (!STOCKS_DEPLOYED) throw new Error("Acciones no disponibles todavía.");
        await approve(t, ADDR.ousd, ousdIn, "OUSD");
        await t.write({ address: DESK, abi: investDeskAbi as Abi, functionName: "buy", args: [ousdIn, withSlippage(quotedOut)] }, "Comprar acciones");
      }),
    sell: (idxIn: bigint, quotedOut: bigint) =>
      tx.run(async (t) => {
        if (!STOCKS_DEPLOYED || !MIDX) throw new Error("Acciones no disponibles todavía.");
        await approve(t, MIDX.token, idxIn, "mIDX");
        await t.write({ address: DESK, abi: investDeskAbi as Abi, functionName: "sell", args: [idxIn, withSlippage(quotedOut)] }, "Vender acciones");
      }),
  };
}
