"use client";
// Mercado Crédito · Back office: the credit platform, all live. Pool KPIs, the loan book (Borrowed/Repaid
// logs + the attestation that authorized each loan), recent underwriting attestations with on-chain
// nonce use, the lenders' side (contracts' Earn) and the pay-per-report Underwriting API.
import { Honesty } from "@/components/console/present";
import { useQuery } from "@tanstack/react-query";
import { Fetch } from "mppx/client";
import { explorerTx } from "@mercado/shared";
import { Panel, Row, Rows } from "@/components/console";
import { Badge } from "@/components/ui/badge";
import { EarnScreen } from "@/components/earn/earn-screen";
import { usePool } from "@/lib/contracts";
import { fmtAmount } from "@/lib/format";
import { bpsToPct } from "@/components/credit/use-advance";
import { UnderwritingApi } from "./underwriting-api";

type Loan = {
  borrower: string;
  platform?: "uber" | "didi" | "rappi";
  profile?: string;
  principal: string;
  fee: string;
  repaid: string;
  status: "open" | "partially repaid" | "repaid";
  openedAt?: number;
  closedAt?: number;
  txHash: string;
};
type Book = {
  loans: Loan[];
  totals: {
    loans: number;
    repayments: number;
    open: number;
    byPlatform: Record<string, number>;
  };
};
type Att = {
  at: string;
  borrower: string;
  platform: string;
  profile: string;
  score: number;
  maxAmount: string;
  expiry: number;
  nonce: string;
  used: boolean | null;
};

// Reads never go through a wallet's fetch polyfill (nothing here can pay).
const get = async <T,>(url: string) => {
  const res = await Fetch.unwrapFetch(globalThis.fetch)(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
};

const PLATFORM_NAME: Record<string, string> = { uber: "Uber", didi: "DiDi", rappi: "Rappi" };
/** "Uber (demo)"; the "(demo)" suffix hides only in capture mode (?present=1). */
const platform = (p: string) =>
  PLATFORM_NAME[p] ? (
    <>
      {PLATFORM_NAME[p]}
      <Honesty> (demo)</Honesty>
    </>
  ) : (
    p
  );
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (s?: number) => (s ? new Date(s * 1000).toLocaleString() : "—");

export function BackOffice() {
  const pool = usePool();
  const book = useQuery({
    queryKey: ["credit-loans"],
    queryFn: () => get<Book>("/api/credit/loans"),
    refetchInterval: 15_000,
  });
  const atts = useQuery({
    queryKey: ["credit-attestations"],
    queryFn: () => get<{ attestations: Att[] }>("/api/credit/attestations"),
    refetchInterval: 15_000,
  });
  const t = book.data?.totals;
  const utilization =
    pool.outstanding !== undefined && pool.totalAssets
      ? Number((pool.outstanding * 10_000n) / pool.totalAssets)
      : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12">
      <Panel
        title="Platform"
        description="The pool's state and book, read live from the chain."
      >
        <Rows>
          <Row
            label="Pool liquidity"
            value={
              pool.available === undefined
                ? "…"
                : `${fmtAmount(pool.available, 0)} xMXN`
            }
            sub="Idle cash lenders can still lend"
          />
          <Row
            label="Outstanding advances"
            value={
              pool.outstanding === undefined
                ? "…"
                : `${fmtAmount(pool.outstanding, 0)} xMXN`
            }
          />
          <Row
            label="Utilization"
            value={
              utilization === undefined ? "…" : bpsToPct(BigInt(utilization))
            }
            sub={`Cap ${bpsToPct(pool.maxUtilizationBps) ?? "…"} of lender claims (enforced on-chain)`}
          />
          <Row
            label="Realized fees"
            value={
              pool.realizedFees === undefined
                ? "…"
                : `${fmtAmount(pool.realizedFees)} xMXN`
            }
            sub="Paid by drivers on repayment, owed to lenders"
          />
          <Row
            label="Advances / repayments"
            value={t ? `${t.loans} / ${t.repayments}` : "…"}
            sub={t ? `${t.open} still open` : undefined}
          />
        </Rows>
      </Panel>

      <Panel
        title="Loan book"
        description="Every advance from the pool's Borrowed / Repaid events. The platform comes from the signed attestation that authorized the draw (unknown for loans made before attestations were recorded). Repayments are applied oldest first."
      >
        {book.isLoading && (
          <p className="text-muted-foreground py-4 text-[15px]">
            Reading the chain…
          </p>
        )}
        {book.error && (
          <p className="text-destructive py-4 text-[15px]">
            {(book.error as Error).message}
          </p>
        )}
        {book.data && book.data.loans.length === 0 && (
          <p className="text-muted-foreground py-4 text-[15px]">
            No advances yet.
          </p>
        )}
        {book.data && book.data.loans.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead className="text-muted-foreground text-left text-[13px]">
                <tr>
                  <th className="py-2 pr-4 font-medium">Opened</th>
                  <th className="py-2 pr-4 font-medium">Driver</th>
                  <th className="py-2 pr-4 font-medium">Platform</th>
                  <th className="py-2 pr-4 text-right font-medium">Advance</th>
                  <th className="py-2 pr-4 text-right font-medium">Fee</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {book.data.loans.map((l) => (
                  <tr key={l.txHash} className="border-t">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {when(l.openedAt)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-[13px]">
                      {short(l.borrower)}
                    </td>
                    <td className="py-2 pr-4">
                      {l.platform ? (
                        platform(l.platform)
                      ) : (
                        <span className="text-muted-foreground">unknown</span>
                      )}
                    </td>
                    <td className="tabular py-2 pr-4 text-right">
                      {fmtAmount(BigInt(l.principal))}
                    </td>
                    <td className="tabular py-2 pr-4 text-right">
                      {fmtAmount(BigInt(l.fee))}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          l.status === "repaid"
                            ? "text-muted-foreground"
                            : "text-product font-medium"
                        }
                      >
                        {l.status === "repaid"
                          ? `Repaid ${when(l.closedAt)}`
                          : l.status === "open"
                            ? "Open"
                            : "Partially repaid"}
                      </span>
                    </td>
                    <td className="py-2">
                      <a
                        href={explorerTx(l.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[13px] hover:underline"
                      >
                        {l.txHash.slice(0, 10)}… ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Underwriting"
        description="Eligibility attestations this API signed (EIP-712, 15-minute expiry, single-use nonce). Rule: median weekly net, earnings volatility, active weeks and trip consistency → score; credit line = min(15% of median weekly net, 1,500 xMXN) above a score floor of 50."
        aside={<Badge variant="mock">Illustrative, not a credit model</Badge>}
      >
        {atts.isLoading && (
          <p className="text-muted-foreground py-4 text-[15px]">Loading…</p>
        )}
        {atts.error && (
          <p className="text-destructive py-4 text-[15px]">
            {(atts.error as Error).message}
          </p>
        )}
        {atts.data && atts.data.attestations.length === 0 && (
          <p className="text-muted-foreground py-4 text-[15px]">
            No attestations signed for this pool yet.
          </p>
        )}
        {atts.data && atts.data.attestations.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead className="text-muted-foreground text-left text-[13px]">
                <tr>
                  <th className="py-2 pr-4 font-medium">Signed</th>
                  <th className="py-2 pr-4 font-medium">Driver</th>
                  <th className="py-2 pr-4 font-medium">Platform</th>
                  <th className="py-2 pr-4 text-right font-medium">Score</th>
                  <th className="py-2 pr-4 text-right font-medium">Line</th>
                  <th className="py-2 pr-4 font-medium">Expiry</th>
                  <th className="py-2 font-medium">Nonce used</th>
                </tr>
              </thead>
              <tbody>
                {atts.data.attestations.map((a) => (
                  <tr key={`${a.borrower}-${a.nonce}`} className="border-t">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {new Date(a.at).toLocaleTimeString()}
                    </td>
                    <td className="py-2 pr-4 font-mono text-[13px]">
                      {short(a.borrower)}
                    </td>
                    <td className="py-2 pr-4">
                      {platform(a.platform)}
                    </td>
                    <td className="tabular py-2 pr-4 text-right">{a.score}</td>
                    <td className="tabular py-2 pr-4 text-right">
                      {fmtAmount(BigInt(a.maxAmount), 0)}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {new Date(a.expiry * 1000).toLocaleTimeString()}
                    </td>
                    <td className="py-2">
                      {a.used === null ? "…" : a.used ? "Yes (drawn)" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Lenders</h2>
          <p className="text-muted-foreground mt-1 text-[15px]">
            Lenders fund the pool with xMXN and earn only the flat fees drivers
            pay when they repay. No guaranteed return.
          </p>
        </div>
        <EarnScreen embedded />
      </section>

      <UnderwritingApi />
    </div>
  );
}
