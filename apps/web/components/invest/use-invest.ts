"use client";
// Mercado Invest data + actions, all real on-chain:
//   Ahorro en pesos   → CreditPool supply / withdrawAvailable (yield = realized driver fees, variable)
//   Ahorro en dólares → sOUSD (ERC-4626 over OUSD; accrual from an admin-funded demo yield reserve)
//   T-bills           → InvestDesk buy/sell of the demo tTBILL at its admin price feed ± spread
// Positions' cost basis and accrued yield come from the account's own on-chain events.
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, parseAbiItem, type Abi, type Address } from "viem";
import {
  useConfig,
  useConnection,
  usePublicClient,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { readContract } from "wagmi/actions";
import {
  activeAddresses,
  creditPoolAbi,
  investDeskAbi,
  priceFeedAbi,
  stakedOusdAbi,
} from "@mercado/shared";
import {
  ADDR,
  CHAIN_ID,
  COLLATERALS,
  useInvestDesk,
  usePool,
  useTx,
  withSlippage,
  type TxApi,
} from "@/lib/contracts";

const A = activeAddresses();
const sOUSD = COLLATERALS.find((c) => c.symbol === "sOUSD");
const tTBILL = COLLATERALS.find((c) => c.symbol === "tTBILL");
/** InvestDesk (v2 only), from the one source of truth (packages/shared/src/protocol.ts). */
const DESK: Address | undefined =
  A.protocol === "v2" ? A.investDesk : undefined;

export const INVEST = {
  protocol: A.protocol,
  pool: ADDR.creditPool,
  xmxn: ADDR.xmxn,
  ousd: ADDR.ousd,
  sOUSD: sOUSD?.token,
  tTBILL: tTBILL?.token,
  tTBILLFeed: tTBILL?.feed,
  desk: DESK,
  startBlock: BigInt(A.startBlock ?? 0),
};

const REFRESH = { refetchInterval: 10_000 } as const;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const ok = <T>(r: { status: string; result?: unknown } | undefined) =>
  r?.status === "success" ? (r.result as T) : undefined;

// ---------------------------------------------------------------- reads

export function useInvestPositions() {
  const { address } = useConnection();
  const who = address ?? ZERO;
  const pool = usePool();
  const contracts = [
    ...(INVEST.sOUSD
      ? [
          {
            address: INVEST.sOUSD,
            abi: stakedOusdAbi,
            functionName: "balanceOf",
            args: [who],
          },
          {
            address: INVEST.sOUSD,
            abi: stakedOusdAbi,
            functionName: "maxWithdraw",
            args: [who],
          },
          { address: INVEST.sOUSD, abi: stakedOusdAbi, functionName: "aprBps" },
          {
            address: INVEST.sOUSD,
            abi: stakedOusdAbi,
            functionName: "yieldReserve",
          },
          {
            address: INVEST.sOUSD,
            abi: stakedOusdAbi,
            functionName: "totalAssets",
          },
        ]
      : []),
    ...(INVEST.tTBILL && INVEST.tTBILLFeed
      ? [
          {
            address: INVEST.tTBILL,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [who],
          },
          {
            address: INVEST.tTBILLFeed,
            abi: priceFeedAbi,
            functionName: "peek",
          },
        ]
      : []),
  ].map((c) => ({ ...c, chainId: CHAIN_ID }));
  const q = useReadContracts({
    contracts: contracts as never,
    query: { enabled: contracts.length > 0, ...REFRESH },
  });
  const d = (q.data ?? []) as { status: string; result?: unknown }[];
  let i = 0;
  const next = <T>() => ok<T>(d[i++]);
  const dollars = INVEST.sOUSD
    ? {
        shares: address ? next<bigint>() : (i++, undefined),
        value: address ? next<bigint>() : (i++, undefined), // maxWithdraw = OUSD redeemable now
        aprBps: next<bigint>(),
        yieldReserve: next<bigint>(),
        totalAssets: next<bigint>(),
      }
    : undefined;
  const tbill =
    INVEST.tTBILL && INVEST.tTBILLFeed
      ? (() => {
          const bal = address ? next<bigint>() : (i++, undefined);
          const peek = next<readonly [bigint, bigint, boolean]>();
          return {
            balance: bal,
            px8: peek?.[0],
            priceAt: peek?.[1],
            priceValid: peek?.[2],
          };
        })()
      : undefined;
  const deskQ = useInvestDesk();
  const desk = INVEST.desk
    ? {
        reserveOusd: deskQ.reserveOusd,
        reserveTbill: deskQ.reserveTbill,
        spreadBps: deskQ.spreadBps,
        maxTradeUsd: deskQ.maxTradeUsd,
        paused: deskQ.paused,
        /** tTBILL this wallet can sell back (personal, non-transferable buy-back allowance). */
        sellable: deskQ.sellableTbill,
      }
    : undefined;
  const tbillValue =
    tbill?.balance !== undefined && tbill.px8 !== undefined
      ? (tbill.balance * tbill.px8) / 100_000_000n
      : undefined;
  return {
    ...q,
    pesos: {
      balance: address ? pool.lenderBalance : undefined, // principal + realized-fee share
      poolCash: pool.available,
      /** R-044: what THIS lender can withdraw now = min(own claim, idle pool cash). */
      withdrawable:
        address &&
        pool.lenderBalance !== undefined &&
        pool.available !== undefined
          ? pool.lenderBalance < pool.available
            ? pool.lenderBalance
            : pool.available
          : undefined,
      poolAssets: pool.totalAssets,
      realizedFees: pool.realizedFees,
      feeBps: pool.feeBps,
    },
    dollars,
    tbill: tbill && { ...tbill, value: tbillValue },
    desk,
  };
}

// The account's own deposits/withdrawals/trades, from chain logs (cost basis + activity list).
const supplied = parseAbiItem(
  "event Supplied(address indexed lender, uint256 amount)",
);
const withdrawn = parseAbiItem(
  "event Withdrawn(address indexed lender, uint256 amount)",
);
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

export type InvestActivity = {
  product: "pesos" | "dolares" | "tbills";
  label: string;
  amount: bigint;
  symbol: string;
  txHash: `0x${string}`;
  block: bigint;
  logIndex: number;
};

const CHUNK = 50_000n;

export function useInvestHistory() {
  const { address } = useConnection();
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["invest-history", A.protocol, address],
    enabled: !!address && !!client,
    refetchInterval: 15_000,
    queryFn: async () => {
      const c = client!;
      const latest = await c.getBlockNumber();
      const rows: InvestActivity[] = [];
      let pesosIn = 0n,
        pesosOut = 0n,
        dolIn = 0n,
        dolOut = 0n,
        tbCost = 0n,
        tbProceeds = 0n;
      let sharesIn = 0n,
        sharesOut = 0n,
        tbIn = 0n,
        tbOut = 0n;
      for (let from = INVEST.startBlock; from <= latest; from += CHUNK) {
        const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
        const range = { fromBlock: from, toBlock: to, strict: true } as const;
        const [s, w, dep, wd, b, so] = await Promise.all([
          c.getLogs({
            address: INVEST.pool,
            event: supplied,
            args: { lender: address },
            ...range,
          }),
          c.getLogs({
            address: INVEST.pool,
            event: withdrawn,
            args: { lender: address },
            ...range,
          }),
          INVEST.sOUSD
            ? c.getLogs({
                address: INVEST.sOUSD,
                event: depositEv,
                args: { owner: address },
                ...range,
              })
            : [],
          INVEST.sOUSD
            ? c.getLogs({
                address: INVEST.sOUSD,
                event: withdrawEv,
                args: { owner: address },
                ...range,
              })
            : [],
          INVEST.desk
            ? c.getLogs({
                address: INVEST.desk,
                event: bought,
                args: { user: address },
                ...range,
              })
            : [],
          INVEST.desk
            ? c.getLogs({
                address: INVEST.desk,
                event: sold,
                args: { user: address },
                ...range,
              })
            : [],
        ]);
        for (const l of s) {
          pesosIn += l.args.amount;
          rows.push({
            product: "pesos",
            label: "Depósito · ahorro en pesos",
            amount: l.args.amount,
            symbol: "xMXN",
            txHash: l.transactionHash,
            block: l.blockNumber,
            logIndex: l.logIndex,
          });
        }
        for (const l of w) {
          pesosOut += l.args.amount;
          rows.push({
            product: "pesos",
            label: "Retiro · ahorro en pesos",
            amount: l.args.amount,
            symbol: "xMXN",
            txHash: l.transactionHash,
            block: l.blockNumber,
            logIndex: l.logIndex,
          });
        }
        for (const l of dep) {
          dolIn += l.args.assets;
          sharesIn += l.args.shares;
          rows.push({
            product: "dolares",
            label: "Depósito · ahorro en dólares",
            amount: l.args.assets,
            symbol: "OUSD",
            txHash: l.transactionHash,
            block: l.blockNumber,
            logIndex: l.logIndex,
          });
        }
        for (const l of wd) {
          dolOut += l.args.assets;
          sharesOut += l.args.shares;
          rows.push({
            product: "dolares",
            label: "Retiro · ahorro en dólares",
            amount: l.args.assets,
            symbol: "OUSD",
            txHash: l.transactionHash,
            block: l.blockNumber,
            logIndex: l.logIndex,
          });
        }
        for (const l of b) {
          tbCost += l.args.ousdUsed;
          tbIn += l.args.tbillOut;
          rows.push({
            product: "tbills",
            label: "Compra · T-bills",
            amount: l.args.tbillOut,
            symbol: "tTBILL",
            txHash: l.transactionHash,
            block: l.blockNumber,
            logIndex: l.logIndex,
          });
        }
        for (const l of so) {
          tbProceeds += l.args.ousdOut;
          tbOut += l.args.tbillIn;
          rows.push({
            product: "tbills",
            label: "Venta · T-bills",
            amount: l.args.tbillIn,
            symbol: "tTBILL",
            txHash: l.transactionHash,
            block: l.blockNumber,
            logIndex: l.logIndex,
          });
        }
      }
      rows.sort((x, y) =>
        x.block === y.block
          ? y.logIndex - x.logIndex
          : x.block > y.block
            ? -1
            : 1,
      );
      return {
        rows,
        /** Net amounts put in (deposits − withdrawals), for "earned since deposit". */
        netPesos: pesosIn - pesosOut,
        netDolares: dolIn - dolOut,
        /** OUSD spent on tTBILL minus OUSD received from sales. */
        netTbillCost: tbCost - tbProceeds,
        /** sOUSD shares / tTBILL units explained by this wallet's own deposits and desk trades. Return math
         *  is only meaningful when these equal the wallet's actual holdings (R-045: transfers, Mint
         *  collateral or a faucet would otherwise be miscounted as gains/losses). */
        sharesFromEvents: sharesIn - sharesOut,
        tbillFromEvents: tbIn - tbOut,
      };
    },
  });
}

/** Live InvestDesk quote while the user types. */
export function useTbillQuote(side: "buy" | "sell", amountIn: bigint) {
  const q = useReadContract({
    address: INVEST.desk,
    abi: investDeskAbi,
    functionName: side === "buy" ? "quoteBuy" : "quoteSell",
    args: [amountIn],
    chainId: CHAIN_ID,
    query: {
      enabled: !!INVEST.desk && amountIn > 0n,
      retry: false,
      refetchInterval: 10_000,
    },
  });
  const r = q.data as readonly [bigint, bigint, bigint] | undefined;
  return { ...q, out: r?.[0], fee: r?.[1], px8: r?.[2] };
}

// ---------------------------------------------------------------- actions

export function useInvestActions() {
  const config = useConfig();
  const tx = useTx();

  const approve = useCallback(
    async (
      t: TxApi,
      token: Address,
      spender: Address,
      amount: bigint,
      symbol: string,
    ) => {
      const allowance = await readContract(config, {
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [t.account, spender],
        chainId: CHAIN_ID,
      });
      if (allowance < amount)
        await t.write(
          {
            address: token,
            abi: erc20Abi as Abi,
            functionName: "approve",
            args: [spender, amount],
          },
          `Aprobar ${symbol}`,
        );
    },
    [config],
  );

  return {
    tx,
    depositPesos: (amount: bigint) =>
      tx.run(async (t) => {
        await approve(t, INVEST.xmxn, INVEST.pool, amount, "xMXN");
        await t.write(
          {
            address: INVEST.pool,
            abi: creditPoolAbi as Abi,
            functionName: "supply",
            args: [amount],
          },
          "Depositar pesos",
        );
      }),
    withdrawPesos: (amount: bigint) =>
      tx.run((t) =>
        t.write(
          {
            address: INVEST.pool,
            abi: creditPoolAbi as Abi,
            functionName: "withdrawAvailable",
            args: [amount],
          },
          "Retirar pesos",
        ),
      ),
    depositDolares: (amount: bigint) =>
      tx.run(async (t) => {
        if (!INVEST.sOUSD)
          throw new Error("Ahorro en dólares needs the v2 protocol.");
        await approve(t, INVEST.ousd, INVEST.sOUSD, amount, "OUSD");
        await t.write(
          {
            address: INVEST.sOUSD,
            abi: stakedOusdAbi as Abi,
            functionName: "deposit",
            args: [amount, t.account],
          },
          "Depositar dólares",
        );
      }),
    withdrawDolares: (assets: bigint) =>
      tx.run(async (t) => {
        if (!INVEST.sOUSD)
          throw new Error("Ahorro en dólares needs the v2 protocol.");
        await t.write(
          {
            address: INVEST.sOUSD,
            abi: stakedOusdAbi as Abi,
            functionName: "withdraw",
            args: [assets, t.account, t.account],
          },
          "Retirar dólares",
        );
      }),
    buyTbill: (ousdIn: bigint, quotedOut: bigint) =>
      tx.run(async (t) => {
        if (!INVEST.desk) throw new Error("T-bills need the v2 protocol.");
        await approve(t, INVEST.ousd, INVEST.desk, ousdIn, "OUSD");
        await t.write(
          {
            address: INVEST.desk,
            abi: investDeskAbi as Abi,
            functionName: "buy",
            args: [ousdIn, withSlippage(quotedOut)],
          },
          "Comprar T-bills",
        );
      }),
    sellTbill: (tbillIn: bigint, quotedOut: bigint) =>
      tx.run(async (t) => {
        if (!INVEST.desk || !INVEST.tTBILL)
          throw new Error("T-bills need the v2 protocol.");
        await approve(t, INVEST.tTBILL, INVEST.desk, tbillIn, "tTBILL");
        await t.write(
          {
            address: INVEST.desk,
            abi: investDeskAbi as Abi,
            functionName: "sell",
            args: [tbillIn, withSlippage(quotedOut)],
          },
          "Vender T-bills",
        );
      }),
  };
}
