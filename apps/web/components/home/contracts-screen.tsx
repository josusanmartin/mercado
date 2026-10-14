"use client";
// Contracts: every deployed address on Tempo Moderato with explorer + verified-source links, and the
// deployment transactions, so anything shown in the app can be checked independently.
import { ExternalLink, ShieldCheck } from "lucide-react";
import { explorerAddress, explorerTx, moderatoDeployment, TEMPO_ADDRESSES, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { shortAddr } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const sourceUrl = (addr: string) => `https://contracts.tempo.xyz/v2/contract/${TEMPO_MODERATO_CHAIN_ID}/${addr}`;

type Row = { name: string; what: string; address?: string; verified?: boolean; note?: string };

const d = moderatoDeployment as Record<string, unknown>;
const a = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : undefined);

const ROWS: Row[] = [
  { name: "CollateralVault", what: "Holds OUSD collateral, tracks each position, the only minter and burner of xMXN.", address: a("vault"), verified: true },
  { name: "xMXN", what: "Mercado Synthetic Peso (testnet). TIP-20 token created through Tempo's TIP20Factory, 6 decimals.", address: a("xMXN") },
  { name: "FXOracleAdapter", what: "MXN-per-USD price with staleness and sanity checks.", address: a("oracle"), verified: true, note: "Mock admin feed on testnet" },
  { name: "SwapDesk", what: "Separately funded OUSD/xMXN inventory with spread, per-swap and daily caps.", address: a("swapDesk"), verified: true },
  { name: "CreditPool", what: "Lender-funded xMXN pool. Advances need a signed, expiring eligibility attestation.", address: a("creditPool"), verified: true },
  { name: "LocalStableFactory", what: "Creates the xMXN market and grants the vault its issuer role.", address: a("factory"), verified: true },
  { name: "OUSD collateral", what: "Testnet OUSD from the Tempo faucet. No real value; not issuer-backed here.", address: a("ousd"), note: "Tempo faucet token" },
  { name: "Attestation signer", what: "Backend key that signs advance eligibility (EIP-712).", address: a("attestationSigner") },
  { name: "Bill merchant", what: "Receives MPP payments for SIMULATED bill top-ups.", address: a("merchant") },
  { name: "Fee token (AlphaUSD)", what: "USD test token that pays transaction fees on Tempo.", address: TEMPO_ADDRESSES.alphaUSD },
];

export function ContractsScreen() {
  const txs = Object.entries((d.txs as Record<string, string> | undefined) ?? {});
  return (
    <>
      <PageHeader
        title="Contracts"
        lede={`Everything the app shows can be checked on Tempo Moderato (chain ${TEMPO_MODERATO_CHAIN_ID}). Contract sources are verified, exact match.`}
      />
      <Card className="py-0">
        <ul className="divide-y">
          {ROWS.map((r) => (
            <li key={r.name} className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr_auto] sm:items-center sm:gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.name}</span>
                {r.note && <Badge variant="mock">{r.note}</Badge>}
              </div>
              <p className="text-muted-foreground text-sm text-pretty">{r.what}</p>
              {r.address ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <a
                    href={explorerAddress(r.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 font-mono text-xs hover:underline"
                    title={r.address}
                  >
                    {shortAddr(r.address, 6)}
                    <ExternalLink className="size-3" />
                  </a>
                  {r.verified && (
                    <a
                      href={sourceUrl(r.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-success inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      <ShieldCheck className="size-3.5" />
                      Source
                    </a>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">Not deployed</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {txs.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Deployment and setup transactions</CardTitle>
            <CardDescription>
              Deployed {typeof d.deployedAt === "string" ? new Date(d.deployedAt).toUTCString() : ""}, including the smoke tests and the
              on-chain FX stress liquidation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
              {txs.map(([label, hash]) => (
                <li key={label} className="flex items-center justify-between gap-3 py-1">
                  <span className="truncate">{label.replace(/#(\d+)$/, " ($1)")}</span>
                  <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="text-primary shrink-0 font-mono text-xs hover:underline">
                    {hash.slice(0, 10)}…
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
