"use client";
// Home: the connected wallet's money at a glance (balances, vault health, advance owed, receipts),
// then the three separate pots of money, so it's clear the vault doesn't fund the desk or the loans.
import Link from "next/link";
import { useConnection } from "wagmi";
import { ArrowUpRight, ExternalLink, Receipt } from "lucide-react";
import { explorerAddress } from "@mercado/shared";
import { useBalances, useOracle, usePool, useVaultPosition } from "@/lib/contracts";
import { useActivity } from "@/lib/activity";
import { fmtAmount, fmtBps, fmtNumber, shortAddr, timeAgo } from "@/lib/format";
import { health, HEALTH_COPY } from "@/lib/vault-math";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { GuillocheBand, GuillocheRosette } from "@/components/shell/guilloche";
import { Stat } from "@/components/shell/labels";
import { useTour, TOUR } from "@/components/tour/demo-tour";
import { personaByAddress, personaById } from "@/components/wallet/personas";
import { RatioMeter } from "@/components/vault/ratio-meter";
import { ThreeBuckets } from "@/components/earn/three-buckets";
import { useRecentOrders } from "@/components/billpay/use-bill-pay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function HomeScreen() {
  const { isConnected } = useConnection();
  return (
    <div className="grid gap-8">
      {isConnected ? <WalletBillete /> : <Intro />}
      {isConnected && (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <HealthTile />
          <AdvanceTile />
          <ReceiptsTile />
        </div>
      )}
      <ThreeBuckets />
      {!isConnected && <Journey />}
    </div>
  );
}

/** The one bold element: the balance shown as a peso banknote, guilloche and all. */
function WalletBillete() {
  const { address } = useConnection();
  const bal = useBalances();
  const fx = useOracle();
  const persona = personaByAddress(address);
  const usdValue = bal.xmxn !== undefined && fx.rate ? Number(bal.xmxn) / 1e6 / fx.rate : undefined;

  return (
    <section
      aria-label="Your balances"
      className="relative isolate overflow-hidden rounded-2xl bg-[#0f3d30] p-6 text-papel shadow-[0_20px_50px_-30px_rgb(16_36_28/0.9)] sm:p-8"
    >
      <GuillocheBand className="pointer-events-none absolute inset-x-0 top-6 -z-10 h-40 w-full text-[#f7c6da]/20" />
      <GuillocheRosette
        size={260}
        layers={4}
        strokeWidth={0.5}
        className="pointer-events-none absolute -right-16 -bottom-20 -z-10 text-[#f7c6da]/25 sm:right-6"
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-papel/75">
        <span className="font-medium text-papel">{persona ? `${persona.name}, ${persona.role}` : "Your wallet"}</span>
        <a href={explorerAddress(address!)} target="_blank" rel="noreferrer" className="tabular hover:text-papel hover:underline">
          {shortAddr(address, 6)}
        </a>
        {persona && <span className="rounded-full border border-papel/25 px-2 py-0.5 text-xs">Testnet demo key</span>}
      </div>
      <p className="mt-6 text-sm text-papel/75">Synthetic pesos</p>
      <p className="font-display text-5xl leading-none font-bold tracking-tight tabular sm:text-6xl">
        {fmtAmount(bal.xmxn)}
        <span className="ml-2 text-2xl font-semibold text-papel/80">xMXN</span>
      </p>
      {usdValue !== undefined && (
        <p className="mt-2 text-sm text-papel/70 tabular">≈ {fmtNumber(usdValue)} USD at the mock rate. Not redeemable for pesos.</p>
      )}
      <dl className="mt-8 grid max-w-lg grid-cols-2 gap-6">
        <div>
          <dt className="text-xs text-papel/70">Testnet OUSD</dt>
          <dd className="font-display text-xl font-semibold tabular">{fmtAmount(bal.ousd)}</dd>
        </div>
        <div>
          <dt className="text-xs text-papel/70">Fee token (AlphaUSD)</dt>
          <dd className="font-display text-xl font-semibold tabular">{fmtAmount(bal.feeToken)}</dd>
          <dd className="text-xs text-papel/60">Mercado calls are fee-sponsored</dd>
        </div>
      </dl>
    </section>
  );
}

function Intro() {
  const { start, going } = useTour();
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card p-6 sm:p-10">
      <GuillocheRosette size={320} layers={4} strokeWidth={0.4} className="text-brand/15 pointer-events-none absolute -top-16 -right-20" />
      <h1 className="font-display max-w-2xl text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
        Pesos you can mint, send, borrow and spend on Tempo.
      </h1>
      <p className="text-muted-foreground mt-4 max-w-xl text-pretty">
        Mercado creates xMXN, a synthetic peso backed by over-collateralized dollars, then puts it to work: money sent home, a cash
        advance for a driver, a phone top-up paid over HTTP. All on testnet, with the mocked parts labeled.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button size="lg" variant="brand" onClick={start} disabled={going}>
          Start the Demo Tour
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href="/mint">Create pesos yourself</Link>
        </Button>
      </div>
    </section>
  );
}

function HealthTile() {
  const pos = useVaultPosition();
  const h = health(pos.ratioBps);
  const has = (pos.debt ?? 0n) > 0n || (pos.collateral ?? 0n) > 0n;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Collateral health</CardTitle>
        <CardDescription>Your vault position</CardDescription>
        <CardAction>
          <TileLink href="/mint" label="Create pesos" />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!has ? (
          <p className="text-muted-foreground text-sm">No vault position. Lock OUSD to mint xMXN.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("font-display text-3xl font-semibold tabular", h === "liquidatable" && "text-destructive")}>
                {fmtBps(pos.ratioBps)}
              </span>
              <span className="text-muted-foreground text-xs">{HEALTH_COPY[h]}</span>
            </div>
            {pos.ratioBps !== null && <RatioMeter bps={pos.ratioBps} />}
            <dl className="grid grid-cols-2 gap-4">
              <Stat label="Locked" value={fmtAmount(pos.collateral)} sub="OUSD" />
              <Stat label="Owed to the vault" value={fmtAmount(pos.debt)} sub="xMXN" />
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AdvanceTile() {
  const pool = usePool();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Advance</CardTitle>
        <CardDescription>From the lender pool, separate from the vault</CardDescription>
        <CardAction>
          <TileLink href="/credit" label="Get an advance" />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {pool.debt === undefined || pool.debt === 0n ? (
          <p className="text-muted-foreground text-sm">Nothing owed. Drivers can get a small advance on their weekly earnings.</p>
        ) : (
          <>
            <p className="font-display text-3xl font-semibold tabular">
              {fmtAmount(pool.debt)} <span className="text-muted-foreground text-base font-normal">xMXN owed</span>
            </p>
            <dl className="grid grid-cols-2 gap-4">
              <Stat label="Borrowed" value={fmtAmount(pool.loanPrincipal)} />
              <Stat label="Flat fee (2%)" value={fmtAmount(pool.loanFee)} />
            </dl>
            <p className="text-muted-foreground text-xs">Repaid manually. Nothing is taken from Uber payouts.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReceiptsTile() {
  const { address } = useConnection();
  const activity = useActivity(address).slice(0, 4);
  const { orders } = useRecentOrders();
  const now = useNow(30_000);
  const bills = orders.filter((o) => !address || !o.receipt?.payer || o.receipt.payer.toLowerCase() === address.toLowerCase()).slice(0, 2);

  return (
    <Card className="md:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Recent receipts</CardTitle>
        <CardDescription>Every line is a transaction on Tempo</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.length === 0 && bills.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing yet from this browser. Transactions you make here show up with explorer links.</p>
        ) : (
          <ul className="divide-y">
            {bills.map((o) => (
              <li key={o.orderId} className="flex items-center gap-3 py-2 text-sm">
                <Receipt className="text-brand size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{o.description}</span>
                <Badge variant={o.status === "FULFILLED_SIMULATED" ? "mock" : o.status === "FAILED" ? "destructive" : "secondary"}>
                  {o.status === "FULFILLED_SIMULATED" ? "Paid · SIMULATED top-up" : o.status.replace("_", " ").toLowerCase()}
                </Badge>
                {o.receipt?.explorerUrl && (
                  <a href={o.receipt.explorerUrl} target="_blank" rel="noreferrer" aria-label="Payment on explorer" className="text-primary">
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </li>
            ))}
            {activity.map((a) => (
              <li key={a.hash} className="flex items-center gap-3 py-2 text-sm">
                <span className="bg-success size-1.5 shrink-0 rounded-full" />
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
                <span className="text-muted-foreground text-xs tabular">{now ? timeAgo(a.at / 1000, now) : ""}</span>
                <a href={a.url} target="_blank" rel="noreferrer" aria-label={`${a.label} on explorer`} className="text-primary">
                  <ExternalLink className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TileLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-primary inline-flex items-center gap-0.5 text-sm hover:underline">
      {label}
      <ArrowUpRight className="size-3.5" />
    </Link>
  );
}

/** The demo journey, SPEC §0 in order. Numbered because it is a sequence. */
function Journey() {
  const { go, going } = useTour();
  return (
    <section aria-labelledby="journey-h" className="grid gap-3">
      <h2 id="journey-h" className="font-display text-2xl font-semibold tracking-tight">
        One peso, start to finish
      </h2>
      <ol className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {TOUR.map((s, i) => {
          const p = personaById(s.persona);
          return (
            <li key={i} className="bg-card">
              <button type="button" disabled={going} onClick={() => go(i)} className="hover:bg-accent/60 grid h-full w-full gap-1 p-4 text-left">
                <span className="text-brand font-display text-sm font-semibold tabular">{i + 1}</span>
                <span className="text-sm font-medium">{s.title}</span>
                <span className="text-muted-foreground text-xs">{p.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
