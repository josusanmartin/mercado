"use client";
// Demo Tour across the six products (judge item 1): Mint → Remesas → Global → Crédito → Card → Invest.
// Each step turns on Demo mode and opens its product, which connects that product's demo account.
// Traceable: when a step starts we record the block and the account's balances; the panel then shows
// live balances with the change since the step began, and every xMXN/OUSD transfer the account made
// or received since that block (read from Transfer logs on Tempo), each linked to the explorer.
// It ends on a summary of every transaction in the tour. No dead ends: Back/Next/Open everywhere.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useConfig, usePublicClient } from "wagmi";
import { readContract } from "wagmi/actions";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Address, type Hex } from "viem";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Loader2, Route, X } from "lucide-react";
import { toast } from "sonner";
import { explorerTx } from "@mercado/shared";
import { ADDR, CHAIN_ID, tokenAbi, useBalances } from "@/lib/contracts";
import { useAnyBusy } from "@/lib/busy";
import { fmtAmount, shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PRODUCTS, type ProductId } from "@/components/console/products";
import { useDemoMode } from "@/components/console/demo-mode";
import { personaByAddress, personaById, type PersonaId } from "@/components/wallet/personas";

export type TourStep = {
  product: Exclude<ProductId, "home">;
  persona: PersonaId;
  href: string;
  title: string;
  doThis: string;
  prefill?: Record<string, string>;
};

export const TOUR: TourStep[] = [
  {
    product: "mint",
    persona: "lp",
    href: "/mint",
    title: "An institution creates pesos",
    doThis: "Lock collateral (OUSD, staked OUSD or a demo T-bill) and mint xMXN. The Risk view shows how far the peso would have to move.",
  },
  {
    product: "remesas",
    persona: "sender",
    href: "/remesas",
    title: "Send money home",
    doThis: "Send US$50 to Mamá. Dollars go in, pesos are minted straight to her wallet in one transaction, with a note.",
    prefill: { amount: "50", memo: "para mamá" },
  },
  {
    product: "global",
    persona: "merchant",
    href: "/global",
    title: "Pay a supplier across the border",
    doThis: "Get a signed indicative quote off the oracle mid, then pay: OUSD in, xMXN minted to the supplier.",
  },
  {
    product: "credito",
    persona: "driver",
    href: "/credito",
    title: "A driver gets an advance",
    doThis: "Connect Demo Uber Data, get a credit line from the signed score, and draw the advance from the lenders' pool.",
  },
  {
    product: "card",
    persona: "driver",
    href: "/card?holder=driver",
    title: "Javier pays at the corner store",
    doThis: "Tienda Doña Mary asks for an amount; Javier approves the tap on his phone and the xMXN moves on-chain. Only the card network is simulated.",
  },
  {
    product: "invest",
    persona: "saver",
    href: "/invest",
    title: "Save and invest",
    doThis: "Peso savings fund the driver advances (real fees, variable, not guaranteed); dollar savings earn demo yield; or buy demo T-bills.",
  },
];

type StepStart = { block: string; xmxn?: string; ousd?: string; account: string };
type TourState = { active: boolean; index: number; finished: boolean; starts: Record<number, StepStart> };
const KEY = "mercado.tour.v3";
const EMPTY: TourState = { active: false, index: 0, finished: false, starts: {} };

type TourCtx = {
  active: boolean;
  finished: boolean;
  index: number;
  step: TourStep | undefined;
  starts: Record<number, StepStart>;
  going: boolean;
  start: () => void;
  stop: () => void;
  finish: () => void;
  go: (index: number) => Promise<void>;
};

const Ctx = createContext<TourCtx | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TourState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [going, setGoing] = useState(false);
  const router = useRouter();
  const demo = useDemoMode();
  const busy = useAnyBusy();
  const client = usePublicClient({ chainId: CHAIN_ID });
  const config = useConfig();

  // Load once, and only save after loading: otherwise the initial empty state overwrites the saved
  // tour (React runs mount effects twice in dev).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as TourState | null;
      if (saved) setState(saved);
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, loaded]);

  const go = useCallback(
    async (index: number, fresh = false) => {
      const step = TOUR[index];
      if (!step) return;
      if (busy) {
        toast.warning("Wait for the current transaction to finish first.");
        return;
      }
      setGoing(true);
      try {
        if (!demo.on) demo.setOn(true);
        // Snapshot where this step starts (block + balances) unless it already has one.
        let snap = fresh ? undefined : state.starts[index];
        const account = personaById(step.persona).address;
        if (!snap && account && client) {
          const [block, xmxn, ousd] = await Promise.all([
            client.getBlockNumber(),
            readContract(config, { address: ADDR.xmxn, abi: tokenAbi, functionName: "balanceOf", args: [account], chainId: CHAIN_ID }).catch(() => undefined),
            readContract(config, { address: ADDR.ousd, abi: tokenAbi, functionName: "balanceOf", args: [account], chainId: CHAIN_ID }).catch(() => undefined),
          ]);
          snap = { block: block.toString(), xmxn: xmxn?.toString(), ousd: ousd?.toString(), account };
        }
        setState((s) => ({
          active: true,
          finished: false,
          index,
          starts: snap ? { ...(fresh ? {} : s.starts), [index]: snap } : fresh ? {} : s.starts,
        }));
        router.push(step.href);
      } catch (e) {
        toast.error(e instanceof Error ? e.message.split("\n")[0] : "Could not open that step");
      } finally {
        setGoing(false);
      }
    },
    [busy, demo, router, state.starts, client, config],
  );

  const value = useMemo<TourCtx>(
    () => ({
      active: state.active,
      finished: state.finished,
      index: state.index,
      step: state.active ? TOUR[state.index] : undefined,
      starts: state.starts,
      going,
      start: () => void go(0, true),
      stop: () => setState((s) => ({ ...s, active: false, finished: false })),
      finish: () => setState((s) => ({ ...s, finished: true })),
      go: (i: number) => go(i),
    }),
    [state, going, go],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTour() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

/** Amounts the current tour step suggests for this page, or {} when the tour isn't on it. */
export function useTourPrefill(href: string): Record<string, string> {
  const { step } = useTour();
  return step && step.href.split("?")[0] === href ? (step.prefill ?? {}) : {};
}

export function TourLauncher() {
  const { active, start, going } = useTour();
  if (active) return null;
  return (
    <Button variant="outline" size="sm" onClick={start} disabled={going}>
      {going ? <Loader2 className="animate-spin" /> : <Route />}
      Demo Tour
    </Button>
  );
}

// ---------------------------------------------------------------- on-chain trace

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 amount)");
export type TraceRow = { hash: Hex; token: "xMXN" | "OUSD"; amount: bigint; dir: "out" | "in"; counterparty: Address; block: bigint };

/** Every xMXN/OUSD transfer to or from `account` since `fromBlock`, newest first. */
export function useTrace(account?: string, fromBlock?: string, enabled = true) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["tour-trace", account, fromBlock, ADDR.xmxn, ADDR.ousd],
    enabled: enabled && !!client && !!account && !!fromBlock,
    refetchInterval: 10_000,
    queryFn: async (): Promise<TraceRow[]> => {
      const who = account as Address;
      const base = { address: [ADDR.xmxn, ADDR.ousd] as Address[], event: TRANSFER, fromBlock: BigInt(fromBlock!), toBlock: "latest" as const };
      const [out, inn] = await Promise.all([client!.getLogs({ ...base, args: { from: who } }), client!.getLogs({ ...base, args: { to: who } })]);
      const rows = [
        ...out.map((l) => ({ l, dir: "out" as const, cp: l.args.to! })),
        ...inn.map((l) => ({ l, dir: "in" as const, cp: l.args.from! })),
      ].map(({ l, dir, cp }) => ({
        hash: l.transactionHash as Hex,
        token: l.address.toLowerCase() === ADDR.xmxn.toLowerCase() ? ("xMXN" as const) : ("OUSD" as const),
        amount: l.args.amount ?? 0n,
        dir,
        counterparty: cp,
        block: l.blockNumber ?? 0n,
      }));
      return rows.sort((a, b) => Number(b.block - a.block));
    },
  });
}

/** Human name for a counterparty: personas, family contacts and Mercado contracts. */
function nameOf(a: Address): string {
  const p = personaByAddress(a);
  if (p) return p.name;
  const lower = a.toLowerCase();
  const addr = ADDR as unknown as Record<string, string | undefined>;
  const known: [string | undefined, string][] = [
    [addr.vault, "the vault"],
    [addr.creditPool, "the lenders' pool"],
    [addr.vamm, "the exchange"],
    [addr.swapDesk, "the swap desk"],
    [addr.card, "Mercado Card"],
    [addr.investDesk, "the invest desk"],
    // public testnet operator accounts (no keys here)
    ["0xbbfba602629beFd51f7bbB3A2966b72ee75208c6", "the card on-ramp"],
    ["0x89416a1F0ee3Cb1651Cb2fF2882A115B7A0b9D3b", "Mercado ops (demo reset)"],
  ];
  const hit = known.find(([x]) => x && x.toLowerCase() === lower);
  if (hit) return hit[1];
  if (/^0x0{40}$/.test(lower)) return "minted / burned";
  return shortAddr(a);
}

function TraceList({ rows, empty }: { rows: TraceRow[] | undefined; empty: string }) {
  if (!rows) return <p className="text-muted-foreground text-[13px]">Reading the chain…</p>;
  if (rows.length === 0) return <p className="text-muted-foreground text-[13px]">{empty}</p>;
  return (
    <ul className="grid gap-1">
      {rows.slice(0, 5).map((r, i) => (
        <li key={r.hash + i}>
          <a href={explorerTx(r.hash)} target="_blank" rel="noreferrer" className="hover:bg-well flex items-center gap-2 rounded-md px-1 py-1 text-[13px]">
            <span className={cn("w-4 text-center font-semibold", r.dir === "in" ? "text-success" : "text-muted-foreground")}>{r.dir === "in" ? "+" : "−"}</span>
            <span className="tabular font-medium">
              {fmtAmount(r.amount)} {r.token}
            </span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate">
              {r.dir === "in" ? "from" : "to"} {nameOf(r.counterparty)}
            </span>
            <ExternalLink className="text-muted-foreground size-3.5 shrink-0" />
          </a>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- panel

export function TourPanel() {
  const { active, finished, index, step, starts, stop, go, going, finish, start } = useTour();
  const path = usePathname();
  const busy = useAnyBusy();
  const [min, setMin] = useState(false);
  const snap = starts[index];
  const bal = useBalances(snap?.account as Address | undefined);
  const trace = useTrace(snap?.account, snap?.block, active && !finished);
  if (!active || !step) return null;
  if (finished) return <TourSummary onClose={stop} onRestart={start} />;
  const p = personaById(step.persona);
  const product = PRODUCTS.find((x) => x.id === step.product)!;
  const here = path === step.href.split("?")[0];
  const delta = (now?: bigint, start?: string) => (now === undefined || start === undefined ? undefined : now - BigInt(start));

  if (min)
    return (
      <button
        type="button"
        onClick={() => setMin(false)}
        className="meta bg-foreground text-background fixed right-4 bottom-[7.2rem] z-40 flex items-center gap-2 rounded-full px-4 py-2 lg:bottom-14"
      >
        <span className="size-2.5 rounded-full" style={{ background: product.color }} />
        Tour {index + 1}/{TOUR.length} · {product.short}
        <ChevronUp className="size-4" />
      </button>
    );

  return (
    <aside
      aria-label="Demo Tour"
      data-product={step.product}
      className="bg-card animate-in fade-in-0 slide-in-from-bottom-3 fixed inset-x-3 bottom-[6.8rem] z-40 max-h-[70dvh] overflow-y-auto rounded-[8px] border border-foreground p-5 shadow-[0_8px_24px_rgb(0_0_0/0.08)] duration-150 sm:right-6 sm:left-auto sm:w-[26rem] lg:bottom-14"
    >
      <div className="flex items-center gap-2">
        <ol className="flex gap-1" aria-label="Tour progress">
          {TOUR.map((s, i) => {
            const pr = PRODUCTS.find((x) => x.id === s.product)!;
            return (
              <li key={i}>
                <button
                  type="button"
                  aria-label={`Step ${i + 1}: ${pr.short}, ${s.title}`}
                  aria-current={i === index ? "step" : undefined}
                  disabled={going || busy}
                  onClick={() => go(i)}
                  className={cn("block h-1.5 w-7 transition-opacity", i === index ? "opacity-100" : i < index ? "opacity-60" : "opacity-20")}
                  style={{ background: pr.color }}
                />
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={() => setMin(true)} className="text-muted-foreground hover:text-foreground ml-auto rounded-full p-1" aria-label="Minimize tour">
          <ChevronDown className="size-4" />
        </button>
        <button type="button" onClick={stop} className="text-muted-foreground hover:text-foreground rounded-full p-1" aria-label="Close tour">
          <X className="size-4" />
        </button>
      </div>

      <p className="meta text-muted-foreground mt-3">
        <span className="mr-1.5 inline-block size-2 align-baseline" style={{ background: product.color }} />
        Paso {index + 1} de {TOUR.length} · {product.name}
      </p>
      <h2 className="display mt-2 text-[1.9rem]">{step.title}</h2>
      <p className="mt-1 text-[15px] text-pretty">{step.doThis}</p>

      <div className="mt-4 grid gap-2 border-t pt-3">
        <p className="meta text-muted-foreground">
          Cuenta demo · <span className="text-foreground">{p.name}</span> · {shortAddr(p.address)}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <BalanceCell label="xMXN" now={bal.xmxn} d={delta(bal.xmxn, snap?.xmxn)} />
          <BalanceCell label="OUSD" now={bal.ousd} d={delta(bal.ousd, snap?.ousd)} />
        </div>
        <p className="meta text-muted-foreground">On-chain since this step started</p>
        <TraceList rows={snap ? trace.data : []} empty="No transfers yet. Each one will appear here with its explorer link." />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="ghost" disabled={index === 0 || going || busy} onClick={() => go(index - 1)}>
          <ChevronLeft />
          Back
        </Button>
        {!here ? (
          <Button size="sm" className="ml-auto" disabled={going || busy} onClick={() => go(index)}>
            {going && <Loader2 className="animate-spin" />}
            Open {product.short}
          </Button>
        ) : index < TOUR.length - 1 ? (
          <Button size="sm" className="ml-auto" disabled={going || busy} onClick={() => go(index + 1)}>
            {going && <Loader2 className="animate-spin" />}
            Next: {PRODUCTS.find((x) => x.id === TOUR[index + 1].product)!.short}
            <ChevronRight />
          </Button>
        ) : (
          <Button size="sm" className="ml-auto" disabled={busy} onClick={finish}>
            See the whole trail
            <ChevronRight />
          </Button>
        )}
      </div>
    </aside>
  );
}

function BalanceCell({ label, now, d }: { label: string; now?: bigint; d?: bigint }) {
  return (
    <div>
      <p className="meta text-muted-foreground">{label}</p>
      <p className="display text-[1.5rem] tabular">{now === undefined ? "—" : fmtAmount(now)}</p>
      {d !== undefined && d !== 0n && (
        <p className={cn("text-[13px] font-medium tabular", d > 0n ? "text-success" : "text-muted-foreground")}>
          {d > 0n ? "+" : "−"}
          {fmtAmount(d > 0n ? d : -d)} this step
        </p>
      )}
    </div>
  );
}

/** Final screen: every step with its account and on-chain transfers. */
function TourSummary({ onClose, onRestart }: { onClose: () => void; onRestart: () => void }) {
  const { starts } = useTour();
  return (
    <aside
      aria-label="Demo Tour summary"
      className="bg-card animate-in fade-in-0 fixed inset-x-3 bottom-[6.8rem] z-40 max-h-[75dvh] overflow-y-auto rounded-[8px] border border-foreground p-5 shadow-[0_8px_24px_rgb(0_0_0/0.08)] duration-150 sm:right-6 sm:left-auto sm:w-[28rem] lg:bottom-14"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="meta text-muted-foreground">Demo Tour · the whole trail</p>
          <h2 className="display mt-1 text-[1.9rem]">Una moneda, seis productos</h2>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground rounded-full p-1" aria-label="Close tour">
          <X className="size-4" />
        </button>
      </div>
      <ol className="mt-4 grid gap-4">
        {TOUR.map((s, i) => (
          <SummaryStep key={i} i={i} step={s} start={starts[i]} />
        ))}
      </ol>
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="outline" onClick={onRestart}>
          Start again
        </Button>
        <Button size="sm" className="ml-auto" asChild>
          <Link href="/" onClick={onClose}>
            Back to Mercado
          </Link>
        </Button>
      </div>
    </aside>
  );
}

function SummaryStep({ i, step, start }: { i: number; step: TourStep; start?: StepStart }) {
  const pr = PRODUCTS.find((x) => x.id === step.product)!;
  const trace = useTrace(start?.account, start?.block, !!start);
  return (
    <li>
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <span className="size-2.5 rounded-full" style={{ background: pr.color }} />
        {i + 1}. {pr.short}: {step.title}
      </p>
      {start ? (
        <div className="mt-1 pl-4">
          <TraceList rows={trace.data} empty="No transfers in this step." />
        </div>
      ) : (
        <p className="text-muted-foreground mt-1 pl-4 text-[13px]">Skipped.</p>
      )}
    </li>
  );
}
