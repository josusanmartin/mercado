"use client";
// Mercado Crédito · Underwriting API: third parties buy a driver's demo underwriting report per call over
// MPP (HTTP 402). Shows how to call it, a LIVE unpaid probe (the real 402 challenge, decoded; never pays),
// and the live ledger of paid calls (PaidCalls).
import { probeChallenge } from "@/lib/mpp/client";
import { useState } from "react";
import { Challenge } from "mppx";
import { Panel, Row, Rows } from "@/components/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtAmount } from "@/lib/format";
import { PaidCalls } from "./paid-calls";
import { usePrice } from "./use-pricing";

const ENDPOINT = "/api/driver/score?access=underwriter";
const DEMO_BORROWER = "0x871aF8b66406F96C6b5f8a156242d9B7a026cC63"; // demo Driver account
const SNIPPET = `import { Mppx, tempo } from "mppx/client";

const mppx = Mppx.create({ polyfill: false, methods: [tempo.charge({ account })] });
const res = await mppx.fetch("https://<mercado>${ENDPOINT}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ borrower: "0x…", profile: "steady" }),
}); // 402 → pays the per-report price on Tempo → 200 + Payment-Receipt
const report = await res.json();`;

type Probe = {
  status: number;
  amount?: string;
  currency?: string;
  recipient?: string;
  expires?: string;
  description?: string;
  realm?: string;
};

export function UnderwritingApi() {
  const price = usePrice("underwriting");
  const [probe, setProbe] = useState<Probe>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Unwrapped fetch and no credential: this only ever sees the 402, it can't pay.
  const runProbe = async () => {
    setBusy(true);
    setError(undefined);
    try {
      // the server makes the unpaid call, so the browser doesn't log a red 402
      const res = await probeChallenge("underwriting", { borrower: DEMO_BORROWER, profile: "steady" });
      const www = res.wwwAuthenticate;
      if (res.status !== 402 || !www) {
        setProbe({ status: res.status });
        return;
      }
      const c = Challenge.deserialize(www);
      const req = c.request as {
        amount?: string;
        currency?: string;
        recipient?: string;
      };
      setProbe({
        status: 402,
        amount: req.amount,
        currency: req.currency,
        recipient: req.recipient,
        expires: c.expires,
        description: c.description,
        realm: c.realm,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Panel
        title="Underwriting API"
        description="Lenders, fintechs and bots buy a driver's demo underwriting report per call. No API key, account or card: the endpoint answers HTTP 402, the caller pays per report on Tempo, and gets the report with a receipt. Same illustrative score on the demo platform data, and never a borrow attestation."
        aside={
          <Badge variant="mock">Demo Uber Data · illustrative score</Badge>
        }
      >
        <Rows>
          <Row
            label="Endpoint"
            value={<span className="font-mono text-sm">POST {ENDPOINT}</span>}
          />
          <Row
            label="Price"
            value={price ? `${price} per report` : "…"}
            sub="Settled on Tempo via MPP (HTTP 402)"
          />
          <Row
            label="Returns"
            value="score · credit line · features · reasons · dataHash"
            sub="No borrow attestation"
          />
        </Rows>
        <pre className="bg-muted mt-4 overflow-x-auto rounded-[12px] p-4 font-mono text-xs leading-relaxed">
          {SNIPPET}
        </pre>
      </Panel>

      <Panel
        title="Live 402"
        description="Calls the real endpoint without paying and decodes the payment challenge Mercado returns. Nothing is charged."
        aside={<Badge variant="success">Live</Badge>}
      >
        <div className="pt-2">
          <Button size="lg" onClick={runProbe} disabled={busy}>
            {busy ? "Calling…" : "Call without paying"}
          </Button>
        </div>
        {error && <p className="text-destructive pt-3 text-sm">{error}</p>}
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
                  <span className="font-mono text-sm">
                    {short(probe.currency)}
                  </span>
                }
              />
            )}
            {probe.recipient && (
              <Row
                label="Pay to"
                value={
                  <span className="font-mono text-sm">
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
        product="underwriting"
        title="Paid reports"
        description="Every underwriting report bought over MPP, recorded when its payment was verified on-chain. Run one yourself: npx tsx scripts/underwriter-agent.ts"
      />
    </div>
  );
}

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
