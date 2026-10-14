"use client";
// "Built on Tempo" (lead/josu 03:20): the six Tempo primitives Mercado actually uses, each with a LIVE proof
// read from Tempo Moderato or our own API on page load (josu's wiring rule: no fixtures). Text only, no
// Tempo logo. A proof that can't be read shows "—" and still links to where it can be checked.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Coins, Fuel, KeyRound, MessageSquareText, Receipt, Zap, type LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useReadContract } from "wagmi";
import { hexToBytes, parseAbiItem, type Address, type Hex } from "viem";
import { explorerAddress, explorerTx, TEMPO_EXPLORER_URL } from "@mercado/shared";
import { ADDR, CHAIN_ID, tokenAbi, useActivityFeed } from "@/lib/contracts";
import { Pulse, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { fmtAmount, fmtNumber } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { Meta } from "@/components/console";
import { WalletDialog } from "@/components/wallet/wallet-menu";
import { probeChallenge } from "@/lib/mpp/client";

const MEMO = parseAbiItem("event TransferWithMemo(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo)");
const CHUNK = 50_000n; // the node's getLogs range limit

/** bytes32 memo → text, only when it is a human note (valid UTF-8, no control characters). */
function memoText(m: Hex): string | null {
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(m)).replace(/\0+$/, "");
    return t && !/[\u0000-\u001f]/.test(t) ? t : null;
  } catch {
    return null;
  }
}

function useBlockTime() {
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["tempo-block-time"],
    enabled: !!client,
    staleTime: 60_000,
    queryFn: async () => {
      const latest = await client!.getBlock();
      const N = 1000n;
      const old = await client!.getBlock({ blockNumber: latest.number - N });
      const ms = (b: typeof latest) => {
        const m = (b as unknown as { timestampMillis?: bigint | string }).timestampMillis;
        return m !== undefined ? Number(BigInt(m)) : Number(b.timestamp) * 1000;
      };
      return { seconds: (ms(latest) - ms(old)) / Number(N) / 1000, block: latest.number, span: Number(N) };
    },
  });
}

/** Newest human-text memo transfer of xMXN, and the newest memo transfer whose fee Mercado's sponsor paid. */
function useMemoProofs() {
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["tempo-memo-proofs", ADDR.xmxn],
    enabled: !!client,
    staleTime: 120_000,
    queryFn: async () => {
      // Review P1 (10:07): a failed read must never look like "no transfers". getLogs errors propagate (the query
      // errors and React Query keeps the last good data → "stale"); sponsor-lookup / receipt failures and the
      // receipt cap mark the sponsorship result incomplete. Only a complete successful read may be empty.
      const sponsor = await fetch("/api/sponsor")
        .then((r) => r.json() as Promise<{ sponsor?: string }>)
        .then((j) => j.sponsor?.toLowerCase())
        .catch(() => undefined);
      const latest = await client!.getBlockNumber();
      let memo: { text: string; hash: Hex } | undefined;
      let sponsored: { hash: Hex; feePayer: string; at?: number } | undefined;
      let receipts = 0;
      let sponsoredComplete = !!sponsor;
      for (let i = 0n; i < 4n && (!memo || !sponsored); i++) {
        const to = latest - i * CHUNK;
        const logs = await client!.getLogs({ address: ADDR.xmxn as Address, event: MEMO, fromBlock: to - CHUNK + 1n, toBlock: to });
        for (const l of [...logs].reverse()) {
          if (!memo && l.args.memo) {
            const text = memoText(l.args.memo);
            if (text) memo = { text, hash: l.transactionHash as Hex };
          }
          if (!sponsored && sponsor && receipts >= 8) sponsoredComplete = false; // bounded check: not proof of none
          if (!sponsored && sponsor && receipts < 8) {
            receipts++;
            const r = await client!.getTransactionReceipt({ hash: l.transactionHash as Hex }).catch(() => {
              sponsoredComplete = false;
              return undefined;
            });
            const fp = (r as unknown as { feePayer?: string } | undefined)?.feePayer?.toLowerCase();
            const ts = (l as unknown as { blockTimestamp?: string | number | bigint }).blockTimestamp;
            if (r && fp === sponsor && fp !== r.from.toLowerCase()) sponsored = { hash: l.transactionHash as Hex, feePayer: fp, at: ts !== undefined ? Number(BigInt(ts)) : undefined };
          }
          if (memo && sponsored) break;
        }
      }
      return { sponsor, memo, sponsored, sponsoredComplete: sponsoredComplete || !!sponsored };
    },
  });
}

/** A real unpaid call to the paid partner quote: it answers 402 with a payment challenge. Made server-side
 *  via /api/mpp/challenge (CR-08), so the browser doesn't log a red 402 in devtools; nothing is charged. */
function use402() {
  return useQuery({
    queryKey: ["tempo-402-probe"],
    staleTime: Infinity,
    queryFn: async () => {
      const [res, pricing] = await Promise.all([
        probeChallenge("move-quote", { side: "usd_to_mxn", amount: "250" }),
        fetch("/api/mpp/pricing").then((r) => r.json() as Promise<Record<string, { amount: string | null; symbol: string }>>),
      ]);
      const price = pricing["move-quote"];
      return { status: res.status, challenge: !!res.wwwAuthenticate, price: price?.amount ? `${fmtAmount(BigInt(price.amount))} ${price.symbol}` : undefined };
    },
  });
}

const ago = (unix: number | undefined, now: number | undefined) => {
  if (!unix || !now) return undefined;
  const s = Math.max(0, Math.floor(now - unix));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 129600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

type ProofQuery = { isPending: boolean; isError: boolean; dataUpdatedAt: number; refetch: () => unknown; data?: unknown };
export type ProofState = "loading" | "ready" | "empty" | "stale" | "error";

/** V6-TASTE #11: one state contract for every proof visual. A failed read never looks like "no activity". */
function proofState(q: ProofQuery, empty = false, incomplete = false): ProofState {
  if (q.isPending) return "loading";
  if (q.isError) return q.data !== undefined ? "stale" : "error";
  if (empty) return incomplete ? "error" : "empty"; // an incomplete read is not evidence of "none"
  return "ready";
}

/** V6-TASTE #12: hover and keyboard focus show the same accent border/background; only actionable tiles lift (≤2px). */
const TILE = "bg-well grid content-start rounded-[8px] border border-transparent p-4 outline-none";
const TILE_ACTION =
  "transition-[transform,border-color,background-color] duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[color-mix(in_oklab,var(--accent)_6%,var(--well))] focus-visible:-translate-y-0.5 focus-visible:border-[var(--accent)] focus-visible:bg-[color-mix(in_oklab,var(--accent)_6%,var(--well))] motion-reduce:hover:translate-y-0 motion-reduce:focus-visible:translate-y-0";

/** v6: one compact proof tile: icon, a live number, one short label; the whole tile links to the proof. */
function Tile({
  icon: Icon,
  value,
  label,
  href,
  external = true,
  pulse,
  q,
  empty,
  incomplete,
}: {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  href?: string;
  external?: boolean;
  pulse?: unknown;
  q: ProofQuery;
  empty?: boolean;
  incomplete?: boolean;
}) {
  const state = proofState(q, empty, incomplete);
  const now = useNow(30_000);
  const checked = q.dataUpdatedAt ? ago(Math.floor(q.dataUpdatedAt / 1000), now) : undefined;
  const big =
    state === "loading" ? (
      // Fixed slot: an amount-shaped skeleton, so nothing moves when the number arrives (V6-TASTE #10).
      <span className="bg-border inline-block h-[0.9em] w-24 animate-pulse rounded-[4px] align-middle" />
    ) : state === "error" ? (
      <span className="text-muted-foreground text-[1.05rem]">Couldn&apos;t read Tempo</span>
    ) : state === "empty" ? (
      <span className="text-muted-foreground text-[1.05rem]">No transfers in this window.</span>
    ) : pulse === undefined ? (
      value
    ) : (
      <Pulse value={pulse}>{value}</Pulse>
    );
  const sub =
    state === "loading" ? (
      "Reading Tempo…"
    ) : state === "stale" ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-[var(--warning)]" aria-hidden />
        Last checked {checked ?? "earlier"}
      </span>
    ) : (
      label
    );
  const body = (
    <>
      <Icon className="size-5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
      <span className="mt-3 block min-h-[1.7rem] text-[1.6rem] leading-[1.05] font-semibold break-words tabular">{big}</span>
      <span className="text-muted-foreground mt-1.5 block text-[13px] leading-snug">{sub}</span>
    </>
  );
  if (state === "error")
    return (
      <div className={TILE}>
        {body}
        <button type="button" onClick={() => void q.refetch()} className="mt-2 justify-self-start text-[13px] font-semibold underline underline-offset-2">
          Retry
        </button>
      </div>
    );
  return href ? (
    <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className={cn(TILE, TILE_ACTION)}>
      {body}
    </Link>
  ) : (
    <div className={TILE}>{body}</div>
  );
}

/**
 * A US → MX arc from the exchange's real recent OUSD→xMXN swaps (Remesas and Global share the exchange).
 * V6-TASTE #2/#11: a FINITE, labeled replay (each dot travels once, then the arc is still; "Replay" runs it
 * again), never perpetual circulation. The route is illustrative (tokens don't prove geography); totals are
 * scoped to the swaps observed in the window. Reduced motion: dots shown at rest. A failed read is not "none".
 */
function MoneyArc() {
  const feed = useActivityFeed("move", { limit: 200 });
  const now = useNow(30_000);
  const reduced = useReducedMotion();
  const [run, setRun] = useState(0);
  const dayAgo = (now ?? 0) - 86_400;
  const recent = feed.rows.filter((r) => r.label === "OUSD → xMXN" && (r.timestamp ?? 0) >= dayAgo);
  const sent = recent.reduce((a, r) => a + r.amount, 0n);
  const delivered = recent.reduce((a, r) => a + (r.amountOut ?? 0n), 0n);
  const dots = recent.slice(0, 8);
  const state = proofState(feed, recent.length === 0);
  const d = "M60 130 C 220 10, 460 10, 640 130";
  return (
    <figure className="bg-well col-span-full grid gap-3 rounded-[8px] p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-center" aria-label="Recent dollar to peso swaps on Mercado's exchange">
      <svg viewBox="0 0 700 150" className="h-24 w-full" aria-hidden>
        <path d={d} fill="none" stroke="var(--c-remesas)" strokeWidth="2" strokeDasharray="4 6" opacity="0.6" />
        <circle cx="60" cy="130" r="6" fill="var(--c-global)" />
        <circle cx="640" cy="130" r="6" fill="var(--c-remesas)" />
        <text x="60" y="148" textAnchor="middle" className="fill-current text-[12px] font-semibold">US</text>
        <text x="640" y="148" textAnchor="middle" className="fill-current text-[12px] font-semibold">MX</text>
        {state === "ready" &&
          dots.map((r, i) =>
            reduced ? (
              <circle key={`${r.txHash}-${r.logIndex}`} r="4.5" fill="var(--c-remesas)" cx={640 - i * 9} cy={130 - i * 2} />
            ) : (
              // One pass per swap, staggered; it freezes at MX (a replay, not a live feed).
              <circle key={`${run}-${r.txHash}-${r.logIndex}`} r="4.5" fill="var(--c-remesas)">
                <animateMotion dur="1.6s" begin={`${i * 0.35}s`} repeatCount="1" fill="freeze" path={d} />
              </circle>
            ),
          )}
      </svg>
      <figcaption className="grid gap-1">
        <span className="text-[15px] font-semibold">
          {state === "loading"
            ? "Reading Tempo…"
            : state === "error"
              ? "Couldn't read Tempo"
              : state === "empty"
                ? "No transfers in this window."
                : `${recent.length} recent swaps observed · last 24 h`}
        </span>
        {(state === "ready" || state === "stale") && (
          <span className="text-muted-foreground text-[13px] tabular">
            US${fmtAmount(sent, 0)} in · MX${fmtAmount(delivered, 0)} out
          </span>
        )}
        <span className="text-muted-foreground text-[13px]">Illustrative route · on-chain OUSD→xMXN swaps</span>
        {state === "ready" && !reduced && (
          <button type="button" onClick={() => setRun((k) => k + 1)} className="justify-self-start text-[13px] font-semibold underline underline-offset-2">
            Replay
          </button>
        )}
        {state === "error" && (
          <button type="button" onClick={() => void feed.refetch()} className="justify-self-start text-[13px] font-semibold underline underline-offset-2">
            Retry
          </button>
        )}
      </figcaption>
    </figure>
  );
}

export function BuiltOnTempo() {
  const supply = useReadContract({ address: ADDR.xmxn, abi: tokenAbi, functionName: "totalSupply", chainId: CHAIN_ID, query: { refetchInterval: 30_000 } });
  const bt = useBlockTime();
  const mp = useMemoProofs();
  const p402 = use402();
  const m = mp.data;
  const now = useNow(15_000);
  const dash = "—";
  return (
    // v6 "show, don't tell": six compact live tiles (icon · live number · one short label) + the US → MX arc.
    <section aria-labelledby="tempo-h" className="grid gap-4 border-t pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="tempo-h" className="display text-[clamp(1.8rem,3vw,2.6rem)]">
          Built on Tempo
        </h2>
        <Meta>Every number below is read live from Tempo Moderato testnet</Meta>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile icon={Coins} q={supply} value={supply.data === undefined ? dash : fmtAmount(supply.data as bigint, 0)} pulse={supply.data?.toString()} label="xMXN on TIP-20" href={explorerAddress(ADDR.xmxn)} />
        <Tile icon={Zap} q={bt} value={bt.data ? `${fmtNumber(bt.data.seconds, 2)} s` : dash} label="per block, settled" href={bt.data ? `${TEMPO_EXPLORER_URL}/block/${bt.data.block}` : undefined} />
        <Tile
          icon={Fuel}
          q={mp}
          empty={!!mp.data && !m?.sponsored}
          incomplete={!!mp.data && !m?.sponsoredComplete}
          value={m?.sponsored ? (ago(m.sponsored.at, now) ?? "✓") : dash}
          label="last fee paid by Mercado"
          href={m?.sponsored ? explorerTx(m.sponsored.hash) : m?.sponsor ? explorerAddress(m.sponsor) : undefined}
        />
        <Tile icon={MessageSquareText} q={mp} empty={!!mp.data && !m?.memo} value={m?.memo ? `“${m.memo.text}”` : dash} label="latest note on-chain" href={m?.memo ? explorerTx(m.memo.hash) : "/remesas"} external={!!m?.memo} />
        <Tile
          icon={Receipt}
          q={p402}
          value={p402.data ? String(p402.data.status) : dash}
          label={p402.data?.price ? `pay per API call · ${p402.data.price}` : "pay per API call"}
          href="/developers"
          external={false}
        />
        <WalletDialog>
          <button type="button" className={cn(TILE, TILE_ACTION, "text-left")}>
            <KeyRound className="size-5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
            <span className="mt-3 block text-[1.6rem] leading-none font-semibold">Passkey</span>
            <span className="text-muted-foreground mt-1.5 block text-[13px] leading-snug">sign in, no seed phrase</span>
          </button>
        </WalletDialog>
        <MoneyArc />
      </div>
    </section>
  );
}
