"use client";
// "Where the money sits": vault collateral, swap-desk inventory and the advance pool are separately funded
// on-chain. Showing them side by side proves the vault isn't funding the desk or the drivers.
import { explorerAddress } from "@mercado/shared";
import { Panel, Row, Rows } from "@/components/console";
import { ADDR, useThreeBuckets } from "@/lib/contracts";
import { fmtAmount } from "@/lib/format";

const MAX_UTILIZATION = 80; // CreditPool maxUtilizationBps / 100

const amt = (v: bigint | undefined, unit: string) => (v === undefined ? "…" : `${fmtAmount(v)} ${unit}`);

function Source({ text, address }: { text: string; address: string }) {
  return (
    <>
      {text}{" "}
      <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        Contract
      </a>
    </>
  );
}

export function ThreeBuckets() {
  const b = useThreeBuckets();
  const lent = b.pool.loansOut;
  const claims = b.pool.lenderClaims;
  const utilization = lent !== undefined && claims ? Number((lent * 10_000n) / claims) / 100 : undefined;

  return (
    <Panel
      title="Where the money sits"
      description="Three separately funded pools, each in its own contract. None of them can spend another's balance."
    >
      <Rows>
        <Row
          label="Vault collateral"
          sub={
            <Source
              text={
                b.protocol === "v2"
                  ? "OUSD, demo staked OUSD and demo T-bills locked by minters, valued in xMXN. It backs only their own debt."
                  : "Testnet OUSD locked by people minting xMXN. It backs only their own debt."
              }
              address={ADDR.vault}
            />
          }
          value={b.protocol === "v2" ? amt(b.vault.collateralValueXmxn, "xMXN") : amt(b.vault.collateralOusd, "OUSD")}
        />
        <Row
          label="xMXN minted against it"
          sub={b.protocol === "v2" ? "CDP debt; xMXN supply = CDP debt + exchange-issued xMXN" : "Total xMXN debt = xMXN supply"}
          value={amt(b.vault.debtXmxn, "xMXN")}
        />
        {b.protocol === "v2" ? (
          <Row
            label="Exchange reserve (Move)"
            sub={<Source text="OUSD held by the vault's exchange to redeem the xMXN it issued. Never touches CDP collateral." address={ADDR.vamm} />}
            value={
              b.move === undefined ? (
                "…"
              ) : (
                <>
                  {fmtAmount(b.move.reserveOusd)} OUSD
                  <br />
                  <span className="text-muted-foreground text-sm font-normal">
                    backs {fmtAmount(b.move.liabilityXmxn)} xMXN ·{" "}
                    {b.move.coverageBps === undefined || b.move.coverageBps > 10_000_000n ? "—" : `${(Number(b.move.coverageBps) / 100).toFixed(0)}% covered`}
                  </span>
                </>
              )
            }
          />
        ) : (
          <Row
            label="Swap desk inventory"
            sub={<Source text="Seeded separately by a liquidity provider. A capped demo desk, not a market." address={ADDR.swapDesk} />}
            value={
              b.desk.ousd === undefined ? (
                "…"
              ) : (
                <>
                  {fmtAmount(b.desk.ousd)} OUSD
                  <br />
                  {fmtAmount(b.desk.xmxn)} xMXN
                </>
              )
            }
          />
        )}
        <Row
          label="Advance pool"
          sub={<Source text="xMXN supplied by lenders. It funds driver advances only." address={ADDR.creditPool} />}
          value={
            b.pool.cash === undefined ? (
              "…"
            ) : (
              <>
                {fmtAmount(b.pool.cash)} xMXN available
                <br />
                <span className="text-muted-foreground text-sm font-normal">
                  {fmtAmount(lent)} lent{utilization !== undefined ? ` · ${utilization.toFixed(1)}% of ${MAX_UTILIZATION}% cap` : ""}
                </span>
              </>
            )
          }
        />
      </Rows>
    </Panel>
  );
}
