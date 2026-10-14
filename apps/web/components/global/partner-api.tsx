"use client";
// Mercado Global · Partner API: remittance apps and bots buy a signed indicative quote per call over MPP.
// MPP pays for the API response (the quote), not for the payment itself. Live 402 probe (never pays) and
// the live ledger of paid calls.
import { useState } from "react";
import { Challenge } from "mppx";
import { Fetch } from "mppx/client";
import { Panel, Row, Rows } from "@/components/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtAmount } from "@/lib/format";
import { PaidCalls } from "@/components/credito/paid-calls";

const PATH = "/api/move/quote?side=usd_to_mxn&amount=250&access=partner";
const CURL = `# 1) Ask: the API answers 402 with an MPP challenge (amount, token, merchant, expiry)
curl -i "https://<mercado>${PATH}"

# 2) Pay and retry with any MPP client (e.g. mppx), then verify the quote signature:
npx tsx apps/web/lib/server/__tests__/move-partner-bot.mts usd_to_mxn 250`;

type Probe = {
  status: number;
  amount?: string;
  currency?: string;
  recipient?: string;
  expires?: string;
  description?: string;
};

export function PartnerApi() {
  const [probe, setProbe] = useState<Probe>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      // Unwrapped fetch, no credential: this only ever sees the 402. Nothing is paid.
      const res = await Fetch.unwrapFetch(globalThis.fetch)(PATH);
      const www = res.headers.get("WWW-Authenticate");
      if (res.status !== 402 || !www) {
        const body = await res.json().catch(() => ({}));
        setProbe({ status: res.status, description: body?.error });
        return;
      }
      const c = Challenge.deserialize(www);
      const r = c.request as {
        amount?: string;
        currency?: string;
        recipient?: string;
      };
      setProbe({
        status: 402,
        amount: r.amount,
        currency: r.currency,
        recipient: r.recipient,
        expires: c.expires,
        description: c.description,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <Panel
        title="Partner API: signed indicative quotes"
        description="Remittance apps, fintechs and bots buy a quote signed by Mercado (cotización indicativa firmada) per call: no API key, account or card. The endpoint answers HTTP 402, the caller pays 0.50 xMXN on Tempo, and gets the quote, an EIP-191 signature and a receipt. It's indicative: it expires in 30s and execution is bound only by the swap's minimum received. MPP pays for the quote, not for the payment."
        aside={<Badge variant="mock">Testnet pricing</Badge>}
      >
        <Rows>
          <Row
            label="Endpoint"
            value={
              <span className="font-mono text-[13px]">
                GET /api/move/quote?side=…&amp;amount=…&amp;access=partner
              </span>
            }
          />
          <Row
            label="Price"
            value="0.50 xMXN per quote"
            sub="Settled on Tempo via MPP (HTTP 402)"
          />
          <Row
            label="Returns"
            value="rate · mid · spread · size impact · minimum received · expiry · signature"
          />
        </Rows>
        <pre className="bg-muted mt-4 overflow-x-auto rounded-[12px] p-4 font-mono text-[13px] leading-relaxed">
          {CURL}
        </pre>
      </Panel>

      <Panel
        title="Live 402"
        description="Calls the real endpoint without paying and decodes the challenge. Nothing is charged."
      >
        <div className="pt-2">
          <Button size="lg" onClick={run} disabled={busy}>
            {busy ? "Calling…" : "Call without paying"}
          </Button>
        </div>
        {error && <p className="text-destructive pt-3 text-[13px]">{error}</p>}
        {probe && (
          <Rows className="pt-3">
            <Row
              label="Status"
              value={
                probe.status === 402
                  ? "402 Payment Required"
                  : String(probe.status)
              }
            />
            {probe.amount && (
              <Row
                label="Amount"
                value={`${fmtAmount(BigInt(probe.amount))} xMXN`}
              />
            )}
            {probe.currency && (
              <Row
                label="Token"
                value={
                  <span className="font-mono text-[13px]">
                    {short(probe.currency)}
                  </span>
                }
              />
            )}
            {probe.recipient && (
              <Row
                label="Pay to"
                value={
                  <span className="font-mono text-[13px]">
                    {short(probe.recipient)}
                  </span>
                }
              />
            )}
            {probe.expires && (
              <Row
                label="Challenge expires"
                value={new Date(probe.expires).toLocaleTimeString()}
              />
            )}
            {probe.description && (
              <Row label="Description" value={probe.description} />
            )}
          </Rows>
        )}
      </Panel>

      <PaidCalls
        product="move-quote"
        title="Paid quotes"
        description="Every signed quote bought over MPP, recorded when its payment was verified on-chain."
      />
    </div>
  );
}

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
