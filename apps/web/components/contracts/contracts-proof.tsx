"use client";
// "Every contract, live and verified": each Mercado contract grouped by product, with its address, a LIVE Sourcify
// verification check, an explorer link, a one-line purpose, admin powers in plain words, and live key state read
// on-chain right now. v1 is listed as legacy (still deployed). Nothing here is hardcoded state.
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { ExternalLink, History, Layers, Loader2, XCircle } from "lucide-react";
import type { Abi, Address } from "viem";
import {
  activeAddresses,
  creditPoolAbi,
  demoRwaAbi,
  explorerAddress,
  explorerTx,
  fxOracleAdapterAbi,
  investDeskAbi,
  mercadoCardAbi,
  mercadoFactoryV2Abi,
  moderatoDeployment,
  moveAmmAbi,
  multiCollateralVaultAbi,
  priceFeedAbi,
  stakedOusdAbi,
  TEMPO_ADDRESSES,
  TEMPO_MODERATO_CHAIN_ID,
  tip20Abi,
} from "@mercado/shared";
import { ListPane, Panel, Row, SectionLabel, SettingsLayout } from "@/components/console";
import { Badge } from "@/components/ui/badge";
import { CHAIN_ID } from "@/lib/contracts";
import { fmtAmount, fmtBps, shortAddr, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/use-now";
import { usePresent } from "@/components/console/present";
import { CopyAddress, SuccessCheck, useReducedMotion } from "@/lib/motion";

const V2 = activeAddresses("v2");
const V1 = activeAddresses("v1");
const d1 = moderatoDeployment as unknown as Record<string, unknown>;
const d2 = (d1.v2 ?? {}) as Record<string, unknown>;
const col = (s: string) => V2.collaterals.find((c) => c.symbol === s);
const SOURCIFY = (a: string) => `https://contracts.tempo.xyz/v2/contract/${TEMPO_MODERATO_CHAIN_ID}/${a}`;

// ---------------------------------------------------------------- live reads (one multicall batch)

type Read = { key: string; address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };
const R = (key: string, address: Address | undefined, abi: unknown, functionName: string, args?: readonly unknown[]): Read[] =>
  address ? [{ key, address, abi: abi as Abi, functionName, args }] : [];

const tbill = col("tTBILL")?.token;
const tbillLegacy = col("tTBILL-legacy")?.token;
const sousd = col("sOUSD")?.token;
const sousdFeed = col("sOUSD")?.feed;
const ousdFeed = col("OUSD")?.feed;
const tbillFeed = col("tTBILL")?.feed;
const midxFeed = col("mIDX")?.feed;

const READS: Read[] = [
  ...R("fx.peek", V2.oracle, fxOracleAdapterAbi, "peek"),
  ...R("fx.owner", V2.oracle, fxOracleAdapterAbi, "owner"),
  ...R("factory.locked", V2.factory, mercadoFactoryV2Abi, "locked"),
  ...R("xmxn.supply", V2.xMXN, tip20Abi, "totalSupply"),
  ...R("vault.owner", V2.vault, multiCollateralVaultAbi, "owner"),
  ...V2.collaterals.flatMap((c) => [
    ...R(`vault.params.${c.symbol}`, V2.vault, multiCollateralVaultAbi, "params", [c.token]),
    ...R(`vault.totals.${c.symbol}`, V2.vault, multiCollateralVaultAbi, "totals", [c.token]),
  ]),
  ...R("amm.state", V2.vamm, moveAmmAbi, "state"),
  ...R("amm.paused", V2.vamm, moveAmmAbi, "paused"),
  ...R("amm.fee", V2.vamm, moveAmmAbi, "feeBps"),
  ...R("pool.stats", V2.creditPool, creditPoolAbi, "stats"),
  ...R("pool.cash", V2.creditPool, creditPoolAbi, "availableLiquidity"),
  ...R("pool.fee", V2.creditPool, creditPoolAbi, "feeBps"),
  ...R("pool.cap", V2.creditPool, creditPoolAbi, "perUserCap"),
  ...R("pool.util", V2.creditPool, creditPoolAbi, "maxUtilizationBps"),
  ...R("pool.signer", V2.creditPool, creditPoolAbi, "attestationSigner"),
  ...R("card.stats", V2.card, mercadoCardAbi, "stats"),
  ...R("card.paused", V2.card, mercadoCardAbi, "paused"),
  ...R("desk.reserves", V2.investDesk, investDeskAbi, "reserves"),
  ...R("desk.paused", V2.investDesk, investDeskAbi, "paused"),
  ...R("desk.spread", V2.investDesk, investDeskAbi, "spreadBps"),
  ...R("sousd.apr", sousd, stakedOusdAbi, "aprBps"),
  ...R("sousd.assets", sousd, stakedOusdAbi, "totalAssets"),
  ...R("sousd.reserve", sousd, stakedOusdAbi, "yieldReserve"),
  ...R("sousdFeed.price", sousdFeed, priceFeedAbi, "price"),
  ...R("ousdFeed.price", ousdFeed, priceFeedAbi, "price"),
  ...R("tbillFeed.peek", tbillFeed, priceFeedAbi, "peek"),
  ...R("tbill.supply", tbill, demoRwaAbi, "totalSupply"),
  ...R("tbill.faucetCap", tbill, demoRwaAbi, "faucetCap"),
  ...R("tbillLegacy.supply", tbillLegacy, demoRwaAbi, "totalSupply"),
  ...R("midxFeed.peek", midxFeed, priceFeedAbi, "peek"),
  ...R("deskIdx.reserves", V2.investDeskIdx, investDeskAbi, "reserves"),
  ...R("deskIdx.paused", V2.investDeskIdx, investDeskAbi, "paused"),
  ...R("sx.apr", V2.sxMXN, stakedOusdAbi, "aprBps"),
  ...R("sx.assets", V2.sxMXN, stakedOusdAbi, "totalAssets"),
  ...R("sx.reserve", V2.sxMXN, stakedOusdAbi, "yieldReserve"),
];

function useLive() {
  const q = useReadContracts({
    contracts: READS.map(({ address, abi, functionName, args }) => ({ address, abi, functionName, args, chainId: CHAIN_ID })) as never,
    query: { refetchInterval: 15_000 },
  });
  const map = useMemo(() => {
    const m = new Map<string, unknown>();
    (q.data as { status: string; result?: unknown }[] | undefined)?.forEach((r, i) => r.status === "success" && m.set(READS[i].key, r.result));
    return m;
  }, [q.data]);
  return { get: <T,>(k: string) => map.get(k) as T | undefined, loading: q.isLoading };
}

/** Live Sourcify status for an address (the verifier allows browser CORS). */
const verifiedQuery = (address?: string) => ({
  queryKey: ["sourcify", address],
  enabled: !!address,
  staleTime: 10 * 60_000,
  queryFn: async () => {
    const r = await fetch(SOURCIFY(address!));
    if (!r.ok) return { match: null as string | null };
    const j = (await r.json()) as { match?: string; runtimeMatch?: string };
    return { match: j.match === "exact_match" && j.runtimeMatch === "exact_match" ? "exact_match" : (j.match ?? null) };
  },
});
function useVerified(address?: string) {
  return useQuery(verifiedQuery(address));
}

/** The live tally: how many of the deployed contracts are exact-match verified right now (same cached checks as the rows). */
function VerifiedTally({ addresses }: { addresses: string[] }) {
  const qs = useQueries({ queries: addresses.map((a) => verifiedQuery(a)) });
  const done = qs.filter((q) => q.data).length;
  const ok = qs.filter((q) => q.data?.match === "exact_match").length;
  const all = done === addresses.length && ok === addresses.length;
  return (
    <a
      href="#c-mint"
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full border border-current/30 px-3 py-1 text-sm font-medium",
        done < addresses.length ? "text-muted-foreground" : all ? "text-success" : "text-destructive",
      )}
    >
      {all ? (
        <span aria-hidden className="inline-grid">
          <SuccessCheck size={14} />
        </span>
      ) : (
        done < addresses.length && <Loader2 className="size-3.5 animate-spin" aria-hidden />
      )}
      <span className="whitespace-nowrap">
        Verified ✓ {ok} of {addresses.length}
      </span>
      <span className="text-muted-foreground hidden font-normal sm:inline">· exact match on Sourcify, checked live</span>
    </a>
  );
}

// ---------------------------------------------------------------- one contract row

type Item = {
  name: string;
  address?: Address;
  purpose: string;
  admin: string;
  state?: React.ReactNode;
  /** native TIP-20 precompile tokens have no Solidity source to verify */
  precompile?: boolean;
  /** a plain key (EOA), not a contract: nothing to verify */
  key?: boolean;
  badge?: string;
};

function Verified({ address, precompile, keyOnly }: { address?: string; precompile?: boolean; keyOnly?: boolean }) {
  const v = useVerified(precompile || keyOnly ? undefined : address);
  if (precompile) return <Badge variant="secondary">Tempo TIP-20 precompile</Badge>;
  if (keyOnly) return <Badge variant="secondary">Key, not a contract</Badge>;
  if (!address) return null;
  if (v.isLoading)
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <Loader2 className="size-3 animate-spin" /> checking source…
      </span>
    );
  return v.data?.match === "exact_match" ? (
    <a
      href={SOURCIFY(address)}
      target="_blank"
      rel="noreferrer"
      className="group/v text-success relative inline-flex items-center gap-1 rounded-full border border-current/30 px-2 py-0.5 text-xs font-medium outline-none hover:bg-[color-mix(in_oklab,var(--success)_10%,transparent)] focus-visible:ring-2 focus-visible:ring-current"
    >
      {/* the signature success motion: the check draws itself once the live Sourcify check comes back */}
      <span aria-hidden className="inline-grid">
        <SuccessCheck size={12} />
      </span>
      Verified ✓
      {/* v6: the detail reveals on hover/focus instead of sitting in the row (sm+: phones have no hover, and the
          hidden tooltip must not widen a 390px page) */}
      <span className="bg-foreground text-background pointer-events-none absolute top-full left-0 z-10 mt-1.5 hidden sm:block translate-y-1 rounded-md px-2.5 py-1.5 text-xs font-normal whitespace-nowrap opacity-0 shadow-sm transition-[opacity,transform] duration-200 group-hover/v:translate-y-0 group-hover/v:opacity-100 group-focus-visible/v:translate-y-0 group-focus-visible/v:opacity-100">
        exact match on Sourcify: source and deployed bytecode
      </span>
    </a>
  ) : (
    <span className="text-destructive inline-flex items-center gap-1 text-sm">
      <XCircle className="size-4" /> {v.data?.match ? `partial (${v.data.match})` : "not verified"}
    </span>
  );
}

/** Contract rows with the hover sweep (the wrapper carries the hairline). The Panel owns the entrance. */
function ContractRows({ items }: { items: Item[] }) {
  return (
    <div className="grid">
      {items.map((it) => (
        <div key={it.name} className="mx-sweep border-b last:border-b-0 [&>div]:border-b-0">
          <ContractRow it={it} />
        </div>
      ))}
    </div>
  );
}

function ContractRow({ it }: { it: Item }) {
  return (
    <Row
      label={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{it.name}</span>
          {it.badge && <Badge variant="mock">{it.badge}</Badge>}
          <Verified address={it.address} precompile={it.precompile} keyOnly={it.key} />
        </span>
      }
      sub={
        <span className="grid gap-1 pt-1">
          <span className="text-foreground/80">{it.purpose}</span>
          <span>
            <span className="text-foreground/70 font-medium">Admin powers:</span> {it.admin}
          </span>
          {it.state && (
            <span>
              <span className="text-foreground/70 font-medium">Live:</span> {it.state}
            </span>
          )}
        </span>
      }
      value={
        it.address ? (
          <span className="inline-flex items-center gap-2">
            <CopyAddress address={it.address} label={`${it.name} address`} className="text-xs" />
            <a
              href={explorerAddress(it.address)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${it.name} on the explorer`}
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </span>
        ) : (
          "—"
        )
      }
    />
  );
}

// ---------------------------------------------------------------- architecture (review V6 #8)

/**
 * A permissions graph, not a pipeline: the factory grants the two issuer roles (then locks them), the vault and the
 * exchange mint xMXN, the products use it. Admin-controlled inputs (owner key, FX oracle) are dashed side branches.
 * Wide screens get the SVG; below lg the same graph reads top to bottom.
 */
function Architecture({ locked, supply, cdpDebt, coverageBps, rate }: { locked?: boolean; supply?: bigint; cdpDebt?: bigint; coverageBps?: bigint; rate?: number }) {
  const reduced = useReducedMotion();
  const n = (v?: bigint) => (v === undefined ? "…" : fmtAmount(v, 0));
  const cov = coverageBps === undefined ? "…" : coverageBps > 10_000_000n ? "∞" : fmtBps(coverageBps, 0);
  const label = `Contract architecture. The factory granted the issuer role to the vault and the exchange${locked ? " and locked it" : ""}. Both mint xMXN (${n(supply)} in circulation). Card, Crédito and Invest use xMXN. Admin inputs: the owner key sets risk parameters and can pause; the FX oracle relays USD/MXN.`;
  const node = (x: number, y: number, w: number, href: string, title: string, sub: string, kind: "main" | "plain" | "admin" = "plain") => (
    <a href={href} className="group/n">
      <rect
        x={x}
        y={y}
        width={w}
        height={56}
        rx={8}
        strokeWidth={1.5}
        strokeDasharray={kind === "admin" ? "5 4" : undefined}
        className={cn(
          "fill-background transition-colors",
          kind === "main" ? "stroke-[var(--accent)]" : kind === "admin" ? "stroke-muted-foreground/70" : "stroke-foreground/35",
          "group-hover/n:stroke-foreground",
        )}
      />
      <text x={x + 14} y={y + 24} className="fill-foreground text-[14px] font-semibold">
        {title}
      </text>
      <text x={x + 14} y={y + 43} className="fill-muted-foreground text-[12px]">
        {sub}
      </text>
    </a>
  );
  const edge = (d: string, kind: "main" | "admin" = "main") => (
    <path
      d={d}
      fill="none"
      strokeWidth={1.5}
      strokeDasharray={kind === "admin" ? "5 4" : undefined}
      markerEnd={`url(#arch-arrow-${kind})`}
      className={kind === "main" ? "stroke-foreground/45" : "stroke-muted-foreground/60"}
    />
  );
  const tag = (x: number, y: number, t: string) => (
    <text x={x} y={y} textAnchor="middle" className="fill-muted-foreground text-[11px] tracking-wide uppercase">
      {t}
    </text>
  );
  const MINTS = ["M530 98 C585 98 590 160 640 160", "M530 232 C585 232 590 172 640 172"];
  return (
    <figure className="grid gap-3" aria-label={label}>
      {/* lg+: the graph */}
      <svg viewBox="0 0 1100 330" className="hidden h-auto w-full lg:block" aria-hidden>
        <defs>
          {(["main", "admin"] as const).map((k) => (
            <marker key={k} id={`arch-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className={k === "main" ? "fill-foreground/45" : "fill-muted-foreground/60"} />
            </marker>
          ))}
        </defs>
        {/* grants role */}
        {edge("M210 165 C270 165 270 98 328 98")}
        {edge("M210 165 C270 165 270 232 328 232")}
        {tag(292, 169, "grants role")}
        {/* mints */}
        {MINTS.map((d) => (
          <g key={d}>{edge(d)}</g>
        ))}
        {tag(572, 169, "mints")}
        {/* uses */}
        {edge("M810 165 C855 165 855 68 898 68")}
        {edge("M810 165 L898 165")}
        {edge("M810 165 C855 165 855 262 898 262")}
        {tag(852, 155, "uses")}
        {/* admin inputs (dashed) */}
        {edge("M210 44 C270 44 300 84 328 84", "admin")}
        {tag(275, 36, "sets params · pause")}
        {edge("M210 286 C270 286 300 246 328 246", "admin")}
        {tag(275, 304, "USD/MXN price")}
        {node(20, 16, 190, "#c-mint", "Owner key", "risk params · can pause", "admin")}
        {node(20, 137, 190, "#c-mint", "Factory", locked ? "issuer roles locked ✓" : "issuer roles …", "main")}
        {node(20, 258, 190, "#c-oracle-and-sponsorship", "FX oracle", rate === undefined ? "admin-relayed" : `admin-relayed · ${rate.toFixed(2)}`, "admin")}
        {node(330, 70, 200, "#c-mint", "Vault · Mint", `CDP debt ${n(cdpDebt)}`)}
        {node(330, 204, 200, "#c-remesas-global", "Exchange", `coverage ${cov}`)}
        {node(640, 137, 170, "#c-mint", "xMXN", `${n(supply)} in circulation`, "main")}
        {node(900, 40, 180, "#c-card", "Card", "spend")}
        {node(900, 137, 180, "#c-cr-dito", "Crédito", "borrow")}
        {node(900, 234, 180, "#c-invest", "Invest", "save")}
        {/* a mint travelling along each issuer edge (intentional loop; none under reduced motion) */}
        {!reduced && (
          <g data-loop>
            {MINTS.map((d, i) => (
              <circle key={d} r={4} className="fill-[var(--accent)]">
                <animateMotion dur="2.6s" begin={`${i * 1.3}s`} repeatCount="indefinite" path={d} />
              </circle>
            ))}
          </g>
        )}
      </svg>
      {/* below lg: the same graph, top to bottom */}
      <ol className="grid gap-1.5 text-[14px] lg:hidden" aria-hidden>
        <li>
          <a href="#c-mint" className="font-semibold">Factory</a> <span className="text-muted-foreground">· issuer roles {locked ? "locked ✓" : "…"}</span>
        </li>
        <li className="meta text-muted-foreground">↓ grants role</li>
        <li>
          <a href="#c-mint" className="font-semibold">Vault · Mint</a> <span className="text-muted-foreground">+</span>{" "}
          <a href="#c-remesas-global" className="font-semibold">Exchange</a>
        </li>
        <li className="meta text-muted-foreground">↓ mints</li>
        <li>
          <span className="font-semibold">xMXN</span> <span className="text-muted-foreground">· {n(supply)} in circulation</span>
        </li>
        <li className="meta text-muted-foreground">↓ uses</li>
        <li>
          <a href="#c-card" className="font-semibold">Card</a> · <a href="#c-cr-dito" className="font-semibold">Crédito</a> ·{" "}
          <a href="#c-invest" className="font-semibold">Invest</a>
        </li>
        <li className="text-muted-foreground border-muted-foreground/50 mt-1 border-l-2 border-dashed pl-2 text-[13px]">
          Admin inputs: the owner key sets risk params and can pause; the FX oracle relays USD/MXN.
        </li>
      </ol>
    </figure>
  );
}

// ---------------------------------------------------------------- page

type Section = "v2" | "v1" | "history";

export function ContractsProof() {
  const [section, setSection] = useState<Section>("v2");
  const L = useLive();
  const sponsor = useQuery({
    queryKey: ["sponsor-info"],
    queryFn: async () =>
      (await (await fetch("/api/sponsor")).json()) as {
        sponsor: Address;
        policy: { perSenderPerHour: number; globalPerHour: number; maxTxCost: string };
      },
    staleTime: 60_000,
  });
  const now = useNow(15_000);
  const present = usePresent(); // ?present=1 (deck captures only) drops the testnet label
  const x = (v?: bigint, u = "xMXN") => (v === undefined ? "…" : `${fmtAmount(v)} ${u}`);
  const deployer = L.get<Address>("vault.owner");
  const supply = L.get<bigint>("xmxn.supply");
  const OWNER = deployer ? `the deployer key (${shortAddr(deployer)})` : "the deployer key";

  const fx = L.get<readonly [bigint, bigint, boolean]>("fx.peek");
  const ammS = L.get<readonly [bigint, bigint, bigint, bigint, bigint, bigint]>("amm.state");
  const poolS = L.get<readonly [bigint, bigint, bigint, bigint]>("pool.stats");
  const cardS = L.get<readonly [bigint, bigint, bigint, bigint, bigint]>("card.stats");
  const deskR = L.get<readonly [bigint, bigint]>("desk.reserves");
  const tf = L.get<readonly [bigint, bigint, boolean]>("tbillFeed.peek");
  const mf = L.get<readonly [bigint, bigint, boolean]>("midxFeed.peek");
  const deskIdxR = L.get<readonly [bigint, bigint]>("deskIdx.reserves");
  const paused = (k: string) => (L.get<boolean>(k) === undefined ? "…" : L.get<boolean>(k) ? "PAUSED" : "running");

  const collateralState = (sym: string) => {
    const p = L.get<{ mintRatioBps: number; liqRatioBps: number; liqPenaltyBps: number; debtCeiling: bigint; mintPaused: boolean }>(`vault.params.${sym}`);
    const t = L.get<readonly [bigint, bigint]>(`vault.totals.${sym}`);
    if (!p || !t) return "…";
    return `${fmtAmount(t[0])} ${sym} locked · debt ${x(t[1])} of ${x(p.debtCeiling)} ceiling · mint ≥ ${fmtBps(p.mintRatioBps, 0)}, liquidation < ${fmtBps(p.liqRatioBps, 0)}${p.mintPaused ? " · minting PAUSED" : ""}`;
  };

  const groups: { label: string; title: string; description: string; items: Item[] }[] = [
    {
      label: "Mint",
      title: "Mint · xMXN issuance",
      description: "Institutions lock collateral and mint xMXN. Only the vault and the exchange can ever issue xMXN.",
      items: [
        {
          name: "xMXN v2",
          address: V2.xMXN,
          precompile: true,
          purpose: "Mercado Synthetic Peso (testnet), a native Tempo TIP-20, 6 decimals.",
          admin: "None for people: issuer roles were granted once to the vault and the exchange by the factory, then locked forever.",
          state: `${x(L.get<bigint>("xmxn.supply"))} in circulation`,
        },
        {
          name: "MercadoFactoryV2",
          address: V2.factory,
          purpose: "Created xMXN v2 through Tempo's TIP20Factory and granted ISSUER_ROLE to the vault and the exchange.",
          admin: "None left: lockIssuers() is one-shot and has already run; no function can add issuers.",
          state: L.get<boolean>("factory.locked") === undefined ? "…" : L.get<boolean>("factory.locked") ? "issuers locked ✓" : "NOT locked",
        },
        {
          name: "MultiCollateralVault",
          address: V2.vault,
          purpose: "Per-collateral positions: deposit, mint, repay and burn, withdraw, liquidate. Repay never needs an oracle.",
          admin: `${OWNER} can add collaterals, set or swap their price feeds, change risk parameters (within enforced bounds), set debt ceilings and pause new minting per collateral. There is no unrestricted admin sweep, but that is not the same as no control: by changing a feed or risk parameters the owner can make positions liquidatable (and liquidators then seize collateral), and it could list a token and a feed it controls, then mint xMXN against it.`,
          state: `${V2.collaterals.length} collaterals; xMXN debt and ceilings per collateral below`,
        },
        ...V2.collaterals.map<Item>((c) => ({
          name: `Collateral · ${c.symbol}`,
          address: c.token,
          precompile: c.symbol === "OUSD",
          badge: c.demo ? "Demo token" : "Testnet",
          purpose: c.label,
          admin:
            c.symbol === "OUSD"
              ? "Tempo's testnet faucet token; Mercado has no powers over it."
              : c.symbol === "sOUSD"
                ? `${OWNER} sets a mock APR (≤ 20%) and funds the yield; it can't take deposits.`
                : c.symbol === "tTBILL-legacy"
                ? `Legacy faucet-era token: ANYONE could mint it through its public faucet, so new minting against it is paused in the vault (repay/withdraw only). ${OWNER} also mints it.`
                : `${OWNER} is the only minter (demo issuance${c.symbol === "tTBILL" ? "; the public faucet is disabled" : ""}).`,
          state: collateralState(c.symbol),
        })),
        {
          name: "Price feed · OUSD",
          address: ousdFeed,
          purpose: "Constant $1.00 for testnet OUSD (an assumption, labeled as such).",
          admin: "None: immutable.",
          state: L.get<readonly [bigint, bigint]>("ousdFeed.price") ? `$${(Number(L.get<readonly [bigint, bigint]>("ousdFeed.price")![0]) / 1e8).toFixed(2)}` : "…",
        },
        {
          name: "Price feed · sOUSD",
          address: sousdFeed,
          purpose: "Share price of sOUSD × OUSD price; donation-proof (accrual-based).",
          admin: "None: immutable; follows the sOUSD vault.",
          state: L.get<readonly [bigint, bigint]>("sousdFeed.price") ? `$${(Number(L.get<readonly [bigint, bigint]>("sousdFeed.price")![0]) / 1e8).toFixed(6)} per share` : "…",
        },
        {
          name: "Price feed · tTBILL",
          address: tbillFeed,
          badge: "Demo price",
          purpose: "Admin-set price for the demo T-bill, with a sanity band, 2% max move and a 24h staleness limit.",
          admin: `${OWNER} sets the price within the band (2% max move per update), can force-set it past the 2% limit (stress demos), and can pause it.`,
          state: tf ? `$${(Number(tf[0]) / 1e8).toFixed(2)} · updated ${now ? timeAgo(Number(tf[1]), now) : "…"} · ${tf[2] ? "valid" : "INVALID"}` : "…",
        },
        {
          name: "Price feed · mIDX",
          address: midxFeed,
          badge: "Demo price",
          purpose: "Admin-set price for the demo equity index, with a sanity band (10–1,000), 10% max move and a 24h staleness limit.",
          admin: `${OWNER} sets the price within the band (10% max move), can force-set it past that limit, and can pause it.`,
          state: mf ? `$${(Number(mf[0]) / 1e8).toFixed(2)} · updated ${now ? timeAgo(Number(mf[1]), now) : "…"} · ${mf[2] ? "valid" : "INVALID"}` : "…",
        },
      ],
    },
    {
      label: "Remesas + Global",
      title: "Remesas + Global · the exchange",
      description: "OUSD in mints xMXN, xMXN in is burned and redeemed from the exchange's own reserve, never from Mint collateral.",
      items: [
        {
          name: "MoveAMM",
          address: V2.vamm,
          purpose: "Oracle-anchored vAMM: size-dependent pricing, fee, mint-to-recipient in one tx, pro-rata NAV redemptions under 100% coverage.",
          admin: `${OWNER} can pause swaps (which also freezes redemptions), tune fee (≤ 2%), depth and caps including the redemption bucket and issuance ceiling, and withdraw equity only while coverage stays ≥ 120%. Anyone may add equity.`,
          state: ammS
            ? `${paused("amm.paused")} · reserve ${x(ammS[0], "OUSD")} · issued ${x(ammS[1])} · equity ${x(ammS[2], "OUSD")} · coverage ${ammS[3] > 10_000_000n ? "∞" : fmtBps(ammS[3], 0)} · redemptions ${x(ammS[4], "OUSD")} of ${x(ammS[5], "OUSD")} bucket · fee ${fmtBps(L.get<bigint>("amm.fee"), 2)}`
            : "…",
        },
      ],
    },
    {
      label: "Crédito",
      title: "Crédito · advances",
      description: "Lenders fund driver advances; each draw needs a short-lived signed eligibility attestation.",
      items: [
        {
          name: "CreditPool v2",
          address: V2.creditPool,
          purpose: "Lender supply/withdraw (idle cash only), attested borrow with nonce replay protection, repay; flat fee realized on repayment.",
          admin: `${OWNER} can rotate the attestation signer and set the fee (≤ 20%), per-driver cap and utilization cap (up to 100%). There is no direct withdrawal of lenders' funds, but whoever controls the signer decides who may borrow: with the cap at 100%, signed attestations for many wallets could lend out all idle cash.`,
          state: poolS
            ? `cash ${x(L.get<bigint>("pool.cash"))} · lent ${x(poolS[2])} · realized fees ${x(poolS[3])} · fee ${fmtBps(L.get<bigint>("pool.fee"), 1)} · per-driver cap ${x(L.get<bigint>("pool.cap"))} · utilization cap ${fmtBps(L.get<bigint>("pool.util"), 0)}`
            : "…",
        },
        {
          name: "Attestation signer",
          key: true,
          address: L.get<Address>("pool.signer") ?? V2.attestationSigner,
          purpose: "Backend key that signs EIP-712 eligibility from Demo Uber/DiDi/Rappi data (an illustrative score, not a credit model).",
          admin: "A key, not a contract. It decides who may borrow (within the pool's per-driver and utilization caps), so it is trusted by lenders.",
        },
      ],
    },
    {
      label: "Card",
      title: "Card · spend xMXN",
      description: "Real on-chain card controls and settlement; only the card network/PAN is simulated (not Visa/Mastercard).",
      items: [
        {
          name: "MercadoCard",
          address: V2.card,
          purpose: "Virtual cards with a calendar-day limit (midnight CDMX), freeze, allowlisted terminals; every charge needs the holder's EIP-712 tap signature.",
          admin: `${OWNER} can allowlist/delist merchant terminals and pause (which blocks all card spending). It can't charge a card: only an allowlisted terminal with the holder's own signature can.`,
          state: cardS
            ? `${paused("card.paused")} · ${cardS[0]} cards · ${cardS[4]} charges · spent ${x(cardS[1])} · refunded ${x(cardS[2])} · ${cardS[3]} merchant${cardS[3] === 1n ? "" : "s"}`
            : "…",
        },
        {
          name: "Merchant terminal (Tienda Doña Mary)",
          key: true,
          address: V2.merchant,
          purpose: "Demo merchant account: submits Card charges and receives MPP bill payments.",
          admin: "A key, not a contract.",
        },
      ],
    },
    {
      label: "Invest",
      title: "Invest · save and buy T-bills",
      description: "Save in USD (sOUSD), MXN (sxMXN) or Stocks (mIDX via its desk). The T-bill desk remains for Mint collateral users.",
      items: [
        {
          name: "InvestDesk",
          address: V2.investDesk,
          badge: "Demo T-bill",
          purpose: "Buy/sell demo tTBILL for OUSD or xMXN (via the exchange) from finite inventory at the admin feed price + spread; buys back only what each wallet bought.",
          admin: `${OWNER} can seed or withdraw inventory at any time (removing liquidity), set spread (≤ 2%) and the trade cap, and pause. The desk itself never mints tTBILL.`,
          state: deskR ? `${paused("desk.paused")} · inventory ${x(deskR[1], "tTBILL")} · ${x(deskR[0], "OUSD")} · spread ${fmtBps(L.get<bigint>("desk.spread"), 2)}` : "…",
        },
        {
          name: "InvestDesk · Stocks (mIDX)",
          address: V2.investDeskIdx,
          badge: "Demo equity",
          purpose: "Buy/sell the demo US equity index mIDX for OUSD or xMXN from finite inventory at the admin feed price + spread; buys back only what each wallet bought.",
          admin: `${OWNER} can seed or withdraw inventory at any time, set spread (≤ 2%) and the trade cap, and pause. The desk never mints mIDX.`,
          state: deskIdxR ? `${paused("deskIdx.paused")} · inventory ${x(deskIdxR[1], "mIDX")} · ${x(deskIdxR[0], "OUSD")}` : "…",
        },
        {
          name: "sxMXN (peso savings)",
          address: V2.sxMXN,
          badge: "Configured APR",
          purpose: "The sOUSD vault logic over xMXN: a configured APR paid from a funded xMXN reserve; balance never read (donation-proof).",
          admin: `${OWNER} sets the APR (0–20%, so it can stop yield) and funds the yield reserve; no function moves deposits.`,
          state:
            L.get<bigint>("sx.apr") !== undefined
              ? `APR ${fmtBps(L.get<bigint>("sx.apr"), 2)} (configured) · ${x(L.get<bigint>("sx.assets"))} saved · ${x(L.get<bigint>("sx.reserve"))} yield reserve left`
              : "…",
        },
        {
          name: "sOUSD (staked OUSD)",
          address: sousd,
          badge: "Demo yield",
          purpose: "ERC-4626 over OUSD; mock APR paid from funded OUSD; balance never read (donation-proof).",
          admin: `${OWNER} sets the mock APR (0–20%, so it can stop yield) and funds the yield reserve; no function moves deposits.`,
          state:
            L.get<bigint>("sousd.apr") !== undefined
              ? `APR ${fmtBps(L.get<bigint>("sousd.apr"), 2)} (mock) · ${x(L.get<bigint>("sousd.assets"), "OUSD")} staked · ${x(L.get<bigint>("sousd.reserve"), "OUSD")} yield reserve left`
              : "…",
        },
      ],
    },
    {
      label: "Oracle and sponsorship",
      title: "Oracle and fee sponsor",
      description: "Shared by every product.",
      items: [
        {
          name: "FXOracleAdapter (USD/MXN)",
          address: V2.oracle,
          badge: "Admin-relayed",
          purpose: "USD/MXN relayed by an admin key from a public source (Coinbase, intraday); band 5–50, 20% max move, 1h staleness. Not a decentralized oracle.",
          admin: `${OWNER} pushes the rate (the relay never steps past the jump limit), can force-set any in-band rate (stress demos), can change the band and staleness window (setConfig), and can pause. Every price-dependent action trusts this key.`,
          state: fx ? `${(Number(fx[0]) / 1e8).toFixed(4)} MXN/USD · updated ${now ? timeAgo(Number(fx[1]), now) : "…"} · ${fx[2] ? "valid" : "STALE/INVALID"}` : "…",
        },
        {
          name: "Fee sponsor",
          key: true,
          address: sponsor.data?.sponsor,
          purpose: "Pays network fees for Mercado calls so drivers, savers and cardholders need no fee tokens (allowlisted functions only).",
          admin: "A key used by our /api/sponsor relay; it only co-signs as fee payer, never sends funds.",
          state: sponsor.data
            ? `limits: ${sponsor.data.policy.perSenderPerHour} tx per wallet per hour, ${sponsor.data.policy.globalPerHour} per hour overall, ≤ $${(Number(sponsor.data.policy.maxTxCost) / 1e18).toFixed(2)} per tx`
            : "…",
        },
        {
          name: "Fee token (AlphaUSD)",
          address: TEMPO_ADDRESSES.alphaUSD as Address,
          precompile: true,
          purpose: "USD test stablecoin that pays transaction fees on Tempo.",
          admin: "Tempo's; none for Mercado.",
        },
      ],
    },
  ];

  const legacy: Item[] = [
    { name: "CollateralVault (v1)", address: V1.vault, purpose: "OUSD-only vault for xMXN v1.", admin: "None: constants and immutables." },
    { name: "xMXN v1", address: V1.xMXN, precompile: true, purpose: "v1 synthetic peso (TIP-20).", admin: "Issuer locked to the v1 vault." },
    { name: "SwapDesk (v1)", address: V1.swapDesk, purpose: "Separately seeded, capped OUSD/xMXN desk.", admin: `${OWNER} can pause, set params, withdraw its own reserves.` },
    { name: "CreditPool (v1)", address: V1.creditPool, purpose: "v1 lender pool on xMXN v1.", admin: `${OWNER} can rotate the signer and set fee/caps.` },
    { name: "LocalStableFactory (v1)", address: V1.factory, purpose: "Created xMXN v1 and granted its vault the issuer role.", admin: "No role-granting function." },
  ];

  const txs = [
    ...Object.entries((d2.txs as Record<string, string> | undefined) ?? {}).map(([k, h]) => ({ k: `v2 · ${k}`, h })),
    ...Object.entries((d1.txs as Record<string, string> | undefined) ?? {}).map(([k, h]) => ({ k: `v1 · ${k}`, h })),
  ];

  // unique deployed contracts with Solidity source (not precompile tokens, not keys)
  const verifiable = [...new Set(groups.flatMap((g) => g.items.filter((i) => i.address && !i.precompile && !i.key).map((i) => i.address!.toLowerCase())))];
  const total = verifiable.length;

  return (
    <SettingsLayout
      title="Every contract, live and verified"
      statement="Verified contracts"
      meta={`${total} contracts with source · verified on Sourcify, live · xMXN ${L.get<bigint>("xmxn.supply") === undefined ? "…" : fmtAmount(L.get<bigint>("xmxn.supply"), 0)} · Moderato ${TEMPO_MODERATO_CHAIN_ID}${present ? "" : " · Testnet · no real value"}`}
      purpose="Inspect deployed contracts, source verification and admin powers."
      list={
        <ListPane
          label="Contracts sections"
          value={section}
          onChange={(id) => setSection(id as Section)}
          items={[
            { id: "v2", label: "Live (v2)", icon: Layers },
            { id: "v1", label: "Legacy v1", icon: Layers },
            { id: "history", label: "Deployment history", icon: History, hint: String(txs.length) },
          ]}
        />
      }
    >
      {section === "v2" && (
        <div className="grid gap-14">
          {/* v6 architecture: who can issue xMXN, and where it flows; each node jumps to its group below */}
          <div className="grid gap-4">
            <Architecture
              locked={L.get<boolean>("factory.locked")}
              supply={supply}
              cdpDebt={V2.collaterals.reduce<bigint | undefined>((t, c) => {
                const d = L.get<readonly [bigint, bigint]>(`vault.totals.${c.symbol}`)?.[1];
                return t === undefined || d === undefined ? undefined : t + d;
              }, 0n)}
              coverageBps={L.get<readonly bigint[]>("amm.state")?.[3]}
              rate={(() => {
                const f = L.get<readonly [bigint, bigint, boolean]>("fx.peek");
                return f ? Number(f[0]) / 1e8 : undefined;
              })()}
            />
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <VerifiedTally addresses={verifiable} />
              <p className="text-muted-foreground text-[15px]">Testnet trust model: one admin key (the deployer), no timelock or multisig.</p>
            </div>
            <details className="group text-[15px]">
              <summary className="meta text-muted-foreground hover:text-foreground cursor-pointer list-none">
                How it works <span className="inline-block transition-transform group-open:rotate-90">›</span>
              </summary>
              <p className="text-muted-foreground mt-2 max-w-3xl text-pretty">
                Each Mercado contract on Tempo Moderato with its verified source, what it does, who can do what, and its live state.
                &lsquo;No direct sweep&rsquo; is not &lsquo;no control&rsquo;, so the control paths are spelled out per contract.
              </p>
            </details>
          </div>
          {groups.map((g, i) => (
            <section key={g.title} id={`c-${g.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`} className="grid scroll-mt-24 gap-3">
              <SectionLabel index={String(i + 1).padStart(2, "0")}>{g.label}</SectionLabel>
              <Panel title={g.title} description={g.description}>
                <ContractRows items={g.items} />
              </Panel>
            </section>
          ))}
        </div>
      )}
      {section === "v1" && (
        <Panel title="Legacy v1 (still deployed)" description="The first version, before the switch to v2. Still on-chain and verified; the app no longer uses it.">
          <ContractRows items={legacy} />
        </Panel>
      )}
      {section === "history" && (
        <Panel title="Deployment history" description="Every deployment and setup transaction, linked to the explorer.">
          <div className="grid">
            {txs.map(({ k, h }) => (
              <Row
                key={k}
                className="mx-sweep"
                label={<span className="font-mono text-sm">{k}</span>}
                value={
                  <a href={explorerTx(h)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs hover:underline">
                    {h.slice(0, 10)}… <ExternalLink className="size-3" />
                  </a>
                }
              />
            ))}
          </div>
        </Panel>
      )}
    </SettingsLayout>
  );
}
