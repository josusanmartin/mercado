"use client";
// Home, console-menu style: one row of big tiles (each with one live number), a row of round shortcuts,
// then the wallet and the three separate pots of money as quiet settings rows.
// Missing reads render as "—"/"Unavailable", never as zero (an RPC hiccup must not claim "nothing owed").
import { useConnection } from "wagmi";
import { ArrowLeftRight, Coins, FileCode2, HandCoins, Info, Moon, Receipt, Route, Sprout, Sun, Wallet } from "lucide-react";
import { explorerAddress, TEMPO_EXPLORER_URL, TEMPO_MODERATO_CHAIN_ID, TEMPO_RPC_URL } from "@mercado/shared";
import { useBalances, useOracle, usePool, useThreeBuckets, useVaultPosition } from "@/lib/contracts";
import { useActivity } from "@/lib/activity";
import { fmtAmount, fmtBps, fmtNumber, shortAddr, timeAgo } from "@/lib/format";
import { health, HEALTH_COPY } from "@/lib/vault-math";
import { useNow } from "@/lib/use-now";
import { BigNumber, CircleRow, Panel, Row, Rows, TileRow, useTheme, type TileProps } from "@/components/console";
import { useTour, TOUR } from "@/components/tour/demo-tour";
import { personaByAddress } from "@/components/wallet/personas";
import { WalletChooser, WalletDialog } from "@/components/wallet/wallet-menu";
import { useRecentOrders } from "@/components/billpay/use-bill-pay";
import { SystemMap } from "./system-map";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";

const n0 = (v: bigint | undefined) => (v === undefined ? "—" : fmtAmount(v, 0));

export function HomeScreen() {
  const { isConnected } = useConnection();
  const tour = useTour();
  const { theme, toggle } = useTheme();
  const bal = useBalances();
  const pos = useVaultPosition();
  const pool = usePool();
  const buckets = useThreeBuckets();
  const [dialog, setDialog] = useState<"receipts" | "info" | "wallet">();

  const tiles: TileProps[] = [
    {
      title: "Create pesos",
      icon: Coins,
      href: "/mint",
      value: isConnected ? n0(pos.maxMintable) : n0(buckets.xmxnSupply),
      caption: isConnected ? "xMXN you can mint" : "xMXN in circulation",
    },
    { title: "Send money", icon: ArrowLeftRight, href: "/send", value: n0(buckets.desk.xmxn), caption: "xMXN on the swap desk" },
    {
      title: "Get an advance",
      icon: HandCoins,
      href: "/credit",
      value: isConnected && pool.debt !== undefined && pool.debt > 0n ? n0(pool.debt) : n0(buckets.pool.cash),
      caption: isConnected && pool.debt !== undefined && pool.debt > 0n ? "xMXN you owe" : "xMXN available to lend",
    },
    { title: "Pay bills", icon: Receipt, href: "/pay", value: isConnected ? n0(bal.xmxn) : "Telcel", caption: isConnected ? "xMXN to spend" : "airtime, paid over HTTP 402" },
    { title: "Earn", icon: Sprout, href: "/earn", value: n0(buckets.pool.realizedFees), caption: "xMXN fees paid to lenders" },
    {
      title: tour.active ? "Resume the Demo Tour" : "Demo Tour",
      icon: Route,
      onClick: () => (tour.active ? tour.go(tour.index) : tour.start()),
      value: tour.active ? `${tour.index + 1} of ${TOUR.length}` : `${TOUR.length} steps`,
      caption: "one peso, start to finish",
    },
  ];

  return (
    <div className="grid gap-8 sm:gap-10">
      <TileRow label="Mercado" tiles={tiles} />

      <CircleRow
        items={[
          { label: "Receipts", icon: Receipt, onClick: () => setDialog("receipts") },
          { label: "Wallet", icon: Wallet, onClick: () => setDialog("wallet") },
          { label: "Contracts", icon: FileCode2, href: "/contracts" },
          { label: "Network", icon: Info, onClick: () => setDialog("info") },
          { label: theme === "dark" ? "Light" : "Dark", icon: theme === "dark" ? Sun : Moon, onClick: toggle },
        ]}
      />

      <SystemMap />

      <div className="grid gap-6 lg:grid-cols-2">
        <WalletPanel />
        <MoneyPanel />
      </div>

      <Dialog open={dialog === "receipts"} onOpenChange={(o) => !o && setDialog(undefined)}>
        <DialogContent className="sm:max-w-lg">
          <ReceiptsDialog />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "wallet"} onOpenChange={(o) => !o && setDialog(undefined)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <WalletChooser onDone={() => setDialog(undefined)} />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "info"} onOpenChange={(o) => !o && setDialog(undefined)}>
        <DialogContent className="sm:max-w-lg">
          <NetworkDialog />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WalletPanel() {
  const { address, isConnected } = useConnection();
  const bal = useBalances();
  const fx = useOracle();
  const pos = useVaultPosition();
  const pool = usePool();
  const persona = personaByAddress(address);

  if (!isConnected)
    return (
      <Panel title="Your wallet" description="Pick a profile at the top to try Mercado with a testnet demo account, or connect your own wallet.">
        <WalletDialog>
          <button type="button" className="bg-primary text-primary-foreground mt-2 inline-flex h-12 items-center gap-2 rounded-full px-8 text-base font-medium">
            <Wallet className="size-5" />
            Choose a wallet
          </button>
        </WalletDialog>
      </Panel>
    );

  const usd = bal.xmxn !== undefined && fx.rate ? Number(bal.xmxn) / 1e6 / fx.rate : undefined;
  const h = health(pos.ratioBps);
  const hasPosition = pos.collateral !== undefined && pos.debt !== undefined && (pos.collateral > 0n || pos.debt > 0n);

  return (
    <Panel
      title={persona ? `${persona.name}'s wallet` : "Your wallet"}
      description={
        <a href={explorerAddress(address!)} target="_blank" rel="noreferrer" className="tabular hover:underline">
          {shortAddr(address, 6)}
          {persona && " · testnet demo key"}
        </a>
      }
    >
      <BigNumber value={bal.xmxn === undefined ? "—" : fmtAmount(bal.xmxn)} unit="xMXN" className="mt-2" />
      <p className="text-muted-foreground mt-2 text-sm">
        {usd !== undefined ? `≈ ${fmtNumber(usd)} USD at the mock rate. ` : ""}Synthetic pesos, not redeemable for pesos.
      </p>
      <Rows className="mt-4">
        <Row label="Testnet OUSD" value={bal.ousd === undefined ? "—" : fmtAmount(bal.ousd)} />
        <Row
          label="Vault position"
          sub={pos.ratioBps === undefined && pos.collateral === undefined ? undefined : hasPosition ? HEALTH_COPY[h] : undefined}
          value={
            pos.collateral === undefined || pos.debt === undefined
              ? "Unavailable"
              : !hasPosition
                ? "None"
                : `${fmtBps(pos.ratioBps)} · ${fmtAmount(pos.debt, 0)} xMXN owed`
          }
        />
        <Row
          label="Advance owed"
          sub="Repaid manually, never taken from Uber payouts"
          value={pool.debt === undefined ? "Unavailable" : pool.debt === 0n ? "Nothing" : `${fmtAmount(pool.debt)} xMXN`}
        />
        <Row label="Fee token (AlphaUSD)" sub="Mercado calls are fee-sponsored" value={bal.feeToken === undefined ? "—" : fmtAmount(bal.feeToken)} />
      </Rows>
    </Panel>
  );
}

function MoneyPanel() {
  const b = useThreeBuckets();
  const fmt = (v: bigint | undefined, unit: string) => (v === undefined ? "Unavailable" : `${fmtAmount(v, 0)} ${unit}`);
  return (
    <Panel
      title="Where the money sits"
      description="Three separately funded pots. None of them can spend another's money: the vault doesn't fund the desk or the advances."
    >
      <Rows>
        <Row label="Vault collateral" sub="Backs minted xMXN only. Never lent or swapped." value={fmt(b.vault.collateralOusd, "OUSD")} />
        <Row label="Vault debt" sub="All xMXN in circulation was minted against it" value={fmt(b.vault.debtXmxn, "xMXN")} />
        <Row label="Swap desk inventory" sub="Its own capped demo reserves, not a market" value={b.desk.xmxn === undefined ? "Unavailable" : `${fmtAmount(b.desk.xmxn, 0)} xMXN · ${fmtAmount(b.desk.ousd, 0)} OUSD`} />
        <Row label="Advance pool cash" sub="Supplied by lenders, available to drivers" value={fmt(b.pool.cash, "xMXN")} />
        <Row label="Lent to drivers" sub="Outstanding principal, repaid manually" value={fmt(b.pool.loansOut, "xMXN")} />
      </Rows>
    </Panel>
  );
}

function ReceiptsDialog() {
  const { address } = useConnection();
  const activity = useActivity(address).slice(0, 8);
  const { orders } = useRecentOrders();
  const now = useNow(30_000);
  const bills = orders.filter((o) => !address || !o.receipt?.payer || o.receipt.payer.toLowerCase() === address.toLowerCase()).slice(0, 4);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Receipts</DialogTitle>
        <DialogDescription>Transactions made from this browser{address ? ` by ${shortAddr(address)}` : ""}. Each one links to Tempo&apos;s explorer.</DialogDescription>
      </DialogHeader>
      {activity.length === 0 && bills.length === 0 ? (
        <p className="text-muted-foreground py-6 text-sm">Nothing yet. Transactions you make here show up with explorer links.</p>
      ) : (
        <div data-nav="list" className="grid">
          {bills.map((o) => (
            <a
              key={o.orderId}
              data-nav-item=""
              href={o.receipt?.explorerUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 items-center gap-3 rounded-[10px] border-b px-1 text-[15px] last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate">{o.description}</span>
              <Badge variant={o.status === "FULFILLED_SIMULATED" ? "mock" : o.status === "FAILED" ? "destructive" : "secondary"}>
                {o.status === "FULFILLED_SIMULATED" ? "Paid · SIMULATED top-up" : o.status.replace("_", " ").toLowerCase()}
              </Badge>
            </a>
          ))}
          {activity.map((a) => (
            <a
              key={a.hash}
              data-nav-item=""
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 items-center gap-3 rounded-[10px] border-b px-1 text-[15px] last:border-b-0"
            >
              <span className="bg-success size-2 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
              <span className="text-muted-foreground text-sm tabular">{now ? timeAgo(a.at / 1000, now) : ""}</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function NetworkDialog() {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Network and honesty</DialogTitle>
        <DialogDescription>What&apos;s real here, and what is mocked.</DialogDescription>
      </DialogHeader>
      <Rows>
        <Row label="Network" value={`Tempo Moderato testnet · ${TEMPO_MODERATO_CHAIN_ID}`} />
        <Row label="RPC" value={<span className="font-mono text-xs">{TEMPO_RPC_URL.replace("https://", "")}</span>} />
        <Row
          label="Explorer"
          value={
            <a href={TEMPO_EXPLORER_URL} target="_blank" rel="noreferrer" className="hover:underline">
              {TEMPO_EXPLORER_URL.replace("https://", "")}
            </a>
          }
        />
        <Row label="Real on-chain" sub="Contracts, token transfers, vault and pool accounting, MPP payments" value={<Badge variant="success">Real</Badge>} />
        <Row label="Exchange rate" sub="Admin-set testnet feed, not a market price" value={<Badge variant="mock">Mock oracle</Badge>} />
        <Row label="Driver earnings" sub="Synthetic fixtures, not a real Uber account" value={<Badge variant="mock">Demo Uber Data</Badge>} />
        <Row label="Bill top-ups" sub="Payment is real; no airtime is delivered" value={<Badge variant="mock">SIMULATED</Badge>} />
        <Row label="OUSD and xMXN" sub="No real value. xMXN can't be redeemed for pesos; no peg is guaranteed." value="Testnet only" />
      </Rows>
    </>
  );
}
