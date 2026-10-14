"use client";
// Contracts: every deployed address on Tempo Moderato with explorer + verified-source links, and the
// deployment transactions, so anything shown in the app can be checked independently.
import { useState } from "react";
import { Boxes, ExternalLink, History, ShieldCheck } from "lucide-react";
import { explorerAddress, explorerTx, moderatoDeployment, TEMPO_ADDRESSES, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { shortAddr } from "@/lib/format";
import { ListPane, Panel, Row, Rows, SettingsLayout } from "@/components/console";
import { Badge } from "@/components/ui/badge";

const sourceUrl = (addr: string) => `https://contracts.tempo.xyz/v2/contract/${TEMPO_MODERATO_CHAIN_ID}/${addr}`;
const d = moderatoDeployment as Record<string, unknown>;
const a = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : undefined);

type Entry = { name: string; what: string; address?: string; verified?: boolean; note?: string };

const ENTRIES: Entry[] = [
  { name: "CollateralVault", what: "Holds OUSD collateral, tracks each position; the only minter and burner of xMXN", address: a("vault"), verified: true },
  { name: "xMXN", what: "Mercado Synthetic Peso (testnet), a TIP-20 from Tempo's TIP20Factory, 6 decimals", address: a("xMXN") },
  { name: "FXOracleAdapter", what: "MXN-per-USD price with staleness and sanity checks", address: a("oracle"), verified: true, note: "Mock admin feed" },
  { name: "SwapDesk", what: "Separately funded OUSD/xMXN inventory with spread and caps", address: a("swapDesk"), verified: true },
  { name: "CreditPool", what: "Lender-funded xMXN pool; advances need a signed, expiring attestation", address: a("creditPool"), verified: true },
  { name: "LocalStableFactory", what: "Created the xMXN market and gave the vault its issuer role", address: a("factory"), verified: true },
  { name: "OUSD collateral", what: "Testnet OUSD from the Tempo faucet. No real value", address: a("ousd"), note: "Faucet token" },
  { name: "Attestation signer", what: "Backend key that signs advance eligibility (EIP-712)", address: a("attestationSigner") },
  { name: "Bill merchant", what: "Receives MPP payments for SIMULATED top-ups", address: a("merchant") },
  { name: "Fee token (AlphaUSD)", what: "USD test token that pays transaction fees on Tempo", address: TEMPO_ADDRESSES.alphaUSD },
];

export function ContractsScreen() {
  const [section, setSection] = useState<"contracts" | "txs">("contracts");
  const txs = Object.entries((d.txs as Record<string, string> | undefined) ?? {});
  return (
    <SettingsLayout
      title="Contracts"
      list={
        <ListPane
          label="Contracts sections"
          value={section}
          onChange={(id) => setSection(id as typeof section)}
          items={[
            { id: "contracts", label: "Addresses", icon: Boxes, hint: String(ENTRIES.length) },
            { id: "txs", label: "Deployment history", icon: History, hint: String(txs.length) },
          ]}
        />
      }
    >
      {section === "contracts" ? (
        <Panel key="contracts" title="Addresses" description={`Everything the app shows can be checked on Tempo Moderato (chain ${TEMPO_MODERATO_CHAIN_ID}). Contract sources are verified, exact match.`}>
          <Rows data-nav="list">
            {ENTRIES.map((e) => (
              <Row
                key={e.name}
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    {e.name}
                    {e.note && <Badge variant="mock">{e.note}</Badge>}
                  </span>
                }
                sub={e.what}
                value={
                  e.address ? (
                    <span className="flex flex-wrap items-center justify-end gap-3">
                      <a href={explorerAddress(e.address)} target="_blank" rel="noreferrer" data-nav-item="" title={e.address} className="inline-flex items-center gap-1 rounded-full font-mono text-xs hover:underline">
                        {shortAddr(e.address, 6)}
                        <ExternalLink className="size-3" />
                      </a>
                      {e.verified && (
                        <a href={sourceUrl(e.address)} target="_blank" rel="noreferrer" className="text-success inline-flex items-center gap-1 rounded-full text-xs hover:underline">
                          <ShieldCheck className="size-3.5" />
                          Source
                        </a>
                      )}
                    </span>
                  ) : (
                    "Not deployed"
                  )
                }
              />
            ))}
          </Rows>
        </Panel>
      ) : (
        <Panel
          key="txs"
          title="Deployment history"
          description={`Deployed ${typeof d.deployedAt === "string" ? new Date(d.deployedAt).toUTCString() : ""}, including smoke tests and the on-chain FX stress liquidation.`}
        >
          <Rows>
            {txs.map(([label, hash]) => (
              <Row
                key={label}
                className="min-h-12 py-2"
                label={label.replace(/#(\d+)$/, " ($1)")}
                value={
                  <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="rounded-full font-mono text-xs hover:underline">
                    {hash.slice(0, 12)}…
                  </a>
                }
              />
            ))}
          </Rows>
        </Panel>
      )}
    </SettingsLayout>
  );
}
