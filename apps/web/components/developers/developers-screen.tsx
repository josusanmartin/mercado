"use client";
// /developers: Mercado APIs over HTTP 402 (MPP). Every paid endpoint with its live price, the real 402
// challenge (decoded from a no-payment call), copy-paste curl + an mppx client snippet, and a LIVE "Try it"
// that pays from the API partner demo account and shows 402 → pay → 200 + Payment-Receipt.
import { probeChallenge } from "@/lib/mpp/client";
import { useEffect, useState, type CSSProperties } from "react";
import {
  Check,
  Copy,
  FileText,
  Receipt as ReceiptIcon,
  Repeat,
} from "lucide-react";
import { Challenge } from "mppx";
import { explorerTx } from "@mercado/shared";
import {
  ListPane,
  Panel,
  PanelActions,
  Row,
  Rows,
  SettingsLayout,
} from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { personaById } from "@/components/wallet/personas";
import { Honesty, usePresent } from "@/components/console/present";
import { PaidCalls } from "@/components/credito/paid-calls";
import { usePricing } from "@/components/credito/use-pricing";
import { fmtAmount } from "@/lib/format";
import { Stagger, SuccessCheck } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  ENDPOINTS,
  QUOTE_BODY,
  curlFor,
  snippetFor,
  type EndpointId,
  type PaidEndpoint,
} from "./endpoints";
import { useTryIt, type TraceStep } from "./use-try-it";

const ICONS = {
  underwriting: FileText,
  "move-quote": Repeat,
  bills: ReceiptIcon,
} as const;
/** A column on xl; below xl it dissolves so its children join the outer grid's action-first order. */
const COL =
  "contents xl:grid xl:min-w-0 xl:grid-cols-[minmax(0,1fr)] xl:content-start xl:gap-10";
const DRIVER =
  personaById("driver")?.address ??
  "0x871aF8b66406F96C6b5f8a156242d9B7a026cC63";

export function DevelopersScreen() {
  const [tab, setTab] = useState<EndpointId>("underwriting");
  const pricing = usePricing();
  const present = usePresent();
  // client-only page (ClientOnly wrapper), so window is defined
  const [origin] = useState(() => window.location.origin);
  const e = ENDPOINTS.find((x) => x.id === tab)!;

  const price = (id: EndpointId) => {
    const p = pricing.data;
    if (!p) return "…";
    if (id === "bills")
      return !p.bills
        ? "the quoted bill"
        : `the quoted bill (${fmtAmount(BigInt(p.bills.perMxn))} ${p.bills.symbol} per MXN)`;
    return `${fmtAmount(BigInt(p[id].amount))} ${p[id].symbol} per call`;
  };

  return (
    <SettingsLayout
      title="APIs over HTTP 402"
      purpose="Pay per call in xMXN. Inspect the challenge, response and on-chain receipt."
      demo="partner"
      meta={
        pricing.data
          ? `Underwriting ${fmtAmount(BigInt(pricing.data.underwriting.amount))} xMXN · FX quote ${fmtAmount(BigInt(pricing.data["move-quote"].amount))} xMXN · Bills at face value${present ? "" : " · Testnet · no real value"}`
          : undefined
      }
      list={
        <ListPane
          label="Endpoints"
          items={ENDPOINTS.map((x) => ({
            id: x.id,
            label: x.title,
            icon: ICONS[x.id],
            hint: x.product,
          }))}
          value={tab}
          onChange={(id) => setTab(id as EndpointId)}
        />
      }
    >
      {/* Below xl the two columns dissolve (display: contents) into one grid ordered for action first
          (review P1, lead 06:49): endpoint + price → Try it → its ledger → the reference blocks. From xl up
          the columns are real again and the orders reset, so the desktop composition is unchanged. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <p className="order-1 -mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px] xl:hidden">
          <span className="font-mono text-[13px] break-all">
            {e.method} {e.path.split("?")[0]}
          </span>
          <span className="font-semibold">{price(e.id)}</span>
        </p>
        <div className={COL}>
          <div className="order-4 min-w-0 xl:order-none">
            <Panel title={e.title} description={e.summary}>
              <Rows>
                <Row
                  label="Request"
                  value={
                    <span className="font-mono text-[13px]">
                      {e.method} {e.path}
                    </span>
                  }
                />
                <Row
                  label="Price"
                  value={price(e.id)}
                  sub="Live from /api/mpp/pricing (what the route charges)"
                />
                <Row label="Returns" value={e.returns} />
                <Row
                  label="Settles"
                  value="TIP-20 xMXN transfer on Tempo Moderato (42431), memo-bound to the challenge"
                />
              </Rows>
            </Panel>
          </div>
          <div className="order-5 min-w-0 xl:order-none">
            <ChallengeShape key={e.id} endpoint={e} />
          </div>
          <div className="order-6 min-w-0 xl:order-none">
            <Code title="curl: see the 402" code={curlFor(e, origin, DRIVER)} />
          </div>
          <div className="order-7 min-w-0 xl:order-none">
            <Code
              title="mppx client: pay and get the response"
              code={snippetFor(e, origin, DRIVER)}
            />
          </div>
        </div>
        <div className={COL}>
          <div className="order-2 min-w-0 xl:order-none">
            <TryIt key={e.id} endpoint={e} />
          </div>
          {e.id !== "bills" && (
            <div className="order-3 min-w-0 xl:order-none">
              <PaidCalls
                product={e.id}
                title="Paid calls ledger"
                description="Every paid call to this endpoint, recorded when its payment was verified on-chain."
              />
            </div>
          )}
        </div>
      </div>
    </SettingsLayout>
  );
}

/** The real 402 for this endpoint, fetched WITHOUT paying (unwrapped fetch, no credential). */
function ChallengeShape({ endpoint }: { endpoint: PaidEndpoint }) {
  const [shape, setShape] = useState<{
    header: string;
    decoded: unknown;
    body: unknown;
  }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (endpoint.needsQuote) return; // bills: shown in the Try-it trace (a probe would open an order)
    // the server makes the unpaid call (GET /api/mpp/challenge), so the browser doesn't log a red 402
    const probe =
      endpoint.id === "move-quote"
        ? probeChallenge(
            "move-quote",
            Object.fromEntries(new URL(endpoint.path, "http://x").searchParams),
          )
        : probeChallenge(
            "underwriting",
            Object.fromEntries(
              Object.entries(endpoint.body!({ borrower: DRIVER })).map(
                ([k, v]) => [k, String(v)],
              ),
            ),
          );
    probe
      .then(async (res) => {
        const header = res.wwwAuthenticate ?? "";
        if (res.status !== 402 || !header)
          throw new Error(`Expected 402, got ${res.status}`);
        const c = Challenge.deserialize(header);
        setShape({
          header,
          decoded: {
            id: c.id,
            realm: c.realm,
            method: c.method,
            intent: c.intent,
            request: c.request,
            expires: c.expires,
            description: c.description,
            opaque: c.meta,
          },
          body: res.body ?? undefined,
        });
      })
      .catch((e) => setError((e as Error).message));
  }, [endpoint]);

  return (
    <Panel
      title="The 402 challenge"
      description={`${endpoint.needsQuote ? "" : "Live: this endpoint called just now without paying. "}The challenge is HMAC-signed by Mercado, so the amount, token, recipient, chain and order binding can't be altered.`}
      aside={
        endpoint.needsQuote ? undefined : <Badge variant="success">Live</Badge>
      }
    >
      {endpoint.needsQuote && (
        <p className="text-muted-foreground py-2 text-[15px]">
          Same shape, with the amount set to the quoted bill and externalId to
          the order. Run “Try it” to see a real one decoded step by step.
        </p>
      )}
      {error && <p className="text-destructive py-2 text-[15px]">{error}</p>}
      {!endpoint.needsQuote && !shape && !error && (
        <p className="text-muted-foreground py-2 text-[15px]">Calling…</p>
      )}
      {shape && (
        <div className="grid gap-3 pt-2">
          <p className="text-muted-foreground text-[13px]">
            HTTP/1.1 402 Payment Required · WWW-Authenticate
          </p>
          <pre className="bg-muted overflow-x-auto rounded-[12px] p-4 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap">
            {shape.header}
          </pre>
          <p className="text-muted-foreground text-[13px]">Decoded challenge</p>
          <pre className="bg-muted overflow-x-auto rounded-[12px] p-4 font-mono text-[12px] leading-relaxed">
            {JSON.stringify(shape.decoded, null, 2)}
          </pre>
        </div>
      )}
    </Panel>
  );
}

function Code({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Panel
      title={title}
      aside={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      }
    >
      <pre className="bg-muted mt-2 overflow-x-auto rounded-[12px] p-4 font-mono text-[12px] leading-relaxed">
        {code}
      </pre>
    </Panel>
  );
}

function TryIt({ endpoint }: { endpoint: PaidEndpoint }) {
  const t = useTryIt(endpoint, DRIVER);
  const partner = personaById("partner");
  const receiptTx = t.result?.receipt?.reference;
  return (
    <Panel
      variant="card"
      title="Try it: a real paid call"
      description={
        <>
          Pays from the API partner account (
          {partner?.address
            ? `${partner.address.slice(0, 6)}…${partner.address.slice(-4)}`
            : "testnet"}
          ) to Mercado&apos;s merchant on Tempo.
          <Honesty> Real testnet transfer; nothing of real value.</Honesty>
        </>
      }
    >
      <ConnectGate
        persona="partner"
        why="The live call is paid by the API partner demo account (or your own wallet)."
      >
        <PanelActions>
          <Button
            size="lg"
            onClick={t.run}
            pending={t.busy}
            disabled={!t.ready || t.busy}
          >
            {t.busy
              ? "Calling…"
              : t.pending
                ? "Re-check the unresolved order"
                : `Run ${endpoint.method} ${endpoint.path.split("?")[0]}`}
          </Button>
        </PanelActions>
        {endpoint.needsQuote && (
          <p className="text-muted-foreground mt-3 text-[13px]">
            {t.pending
              ? "A previous run ended without a clear answer. This re-checks that order with the same idempotency key (the check itself sends no payment) and resumes the same order only if no payment for it is found on-chain."
              : `Each run buys a new demo top-up (a new order for ${QUOTE_BODY.amountMxn} xMXN; fulfillment is SIMULATED).`}
          </p>
        )}
        {t.trace.length > 0 && (
          <Stagger as="ol" className="mt-6 grid gap-4">
            {t.trace.map((s, i) => (
              <Step key={i} s={s} />
            ))}
          </Stagger>
        )}
        {receiptTx && (
          <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 text-[15px]">
            <SuccessCheck
              size={40}
              label="Paid"
              className="text-success row-span-2"
            />
            <span className="text-muted-foreground text-[13px]">
              Settlement
            </span>
            <a
              href={explorerTx(receiptTx)}
              target="_blank"
              rel="noreferrer"
              className="text-product font-mono font-medium hover:underline"
            >
              {receiptTx.slice(0, 18)}… on the Tempo explorer ↗
            </a>
          </div>
        )}
        {t.result?.body !== undefined && (
          <details className="mt-4">
            <summary className="text-muted-foreground cursor-pointer text-[13px]">
              Response body
            </summary>
            <pre className="bg-background mt-2 max-h-80 overflow-auto rounded-[12px] p-4 font-mono text-[12px] leading-relaxed">
              {JSON.stringify(t.result.body, null, 2)}
            </pre>
          </details>
        )}
      </ConnectGate>
    </Panel>
  );
}

const DOT: Record<TraceStep["kind"], string> = {
  quote: "bg-muted-foreground",
  request: "bg-foreground",
  challenge: "bg-warning",
  credential: "bg-product",
  response: "bg-success",
  error: "bg-destructive",
};

function Step({ s, style }: { s: TraceStep; style?: CSSProperties }) {
  return (
    <li style={style} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
      <span className={cn("mt-1.5 size-2.5 rounded-full", DOT[s.kind])} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline justify-between gap-2 text-[15px] font-medium">
          <span>{s.title}</span>
          <span className="text-muted-foreground tabular text-[12px] font-normal">
            +{s.at} ms
          </span>
        </p>
        {s.detail && (
          <dl className="mt-1 grid gap-0.5 text-[13px]">
            {Object.entries(s.detail)
              .filter(([, v]) => v !== undefined && v !== "")
              .map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2"
                >
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono break-all">{String(v)}</dd>
                </div>
              ))}
          </dl>
        )}
      </div>
    </li>
  );
}
