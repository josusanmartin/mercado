"use client";
// One-click Demo Tour: SPEC §0 steps in the order of DEMO.md, named by the v0.2 modules
// (Create · Move · Lend · Spend). The spine is one xMXN flow:
// pesos are created and sent, a lender funds the pool, the driver draws an advance, pays a bill
// through a real HTTP 402 receipt, then repays. Each step switches to its persona and page, and
// pre-fills the amounts the script uses (screens read them via useTourPrefill).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Route, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAnyBusy } from "@/lib/busy";
import { cn } from "@/lib/utils";
import { personaById, type PersonaId } from "@/components/wallet/personas";
import { useDemoMode } from "@/components/console/demo-mode";

export type TourStep = {
  spec: number; // SPEC §0 step this demonstrates
  persona: PersonaId;
  href: string;
  title: string;
  doThis: string;
  prefill?: Record<string, string>;
};

export const TOUR: TourStep[] = [
  {
    spec: 1,
    persona: "lp",
    href: "/mint",
    title: "Mint: an institution creates pesos",
    doThis: "Lock collateral and mint xMXN. Then open the stress view to see where the position turns red if the peso strengthens.",
  },
  {
    spec: 3,
    persona: "sender",
    href: "/remesas",
    title: "Remesas: send money home",
    doThis: "From the phone: send dollars to Familia (MX). They arrive as xMXN in one transaction, with a note.",
    prefill: { amount: "50", memo: "para mamá" },
  },
  {
    spec: 5,
    persona: "sender",
    href: "/remesas",
    title: "Remesas: recargar Tiempo Aire",
    doThis: "Top up the family's Telcel line. The payment is a real HTTP 402 on Tempo; the top-up itself is SIMULATED.",
    prefill: { screen: "airtime" },
  },
  {
    spec: 3,
    persona: "merchant",
    href: "/global",
    title: "Global: pay a supplier across the border",
    doThis: "Get a signed indicative quote off the oracle mid, then pay. Check the exchange backing.",
  },
  {
    spec: 4,
    persona: "driver",
    href: "/credito",
    title: "Crédito: a driver gets an advance",
    doThis: "Connect the Demo Uber Data, check eligibility, draw the advance, and repay it.",
  },
  {
    spec: 6,
    persona: "lender",
    href: "/credito?tab=lenders",
    title: "Crédito: the lender earns the fee",
    doThis: "Realized fees come only from repaid advances. No return is promised.",
  },
];

type TourState = { active: boolean; index: number };
const KEY = "mercado.tour.v1";

type TourCtx = {
  active: boolean;
  index: number;
  step: TourStep | undefined;
  going: boolean;
  start: () => void;
  stop: () => void;
  go: (index: number) => Promise<void>;
};

const Ctx = createContext<TourCtx | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TourState>({ active: false, index: 0 });
  const [going, setGoing] = useState(false);
  const router = useRouter();
  const demo = useDemoMode();
  const busy = useAnyBusy();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as TourState | null;
      if (saved) setState(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const go = useCallback(
    async (index: number) => {
      const step = TOUR[index];
      if (!step) return;
      if (busy) {
        toast.warning("Wait for the current transaction to finish first.");
        return;
      }
      setGoing(true);
      setState({ active: true, index });
      try {
        // Demo mode makes each product connect its own demo account on arrival.
        if (!demo.on) demo.setOn(true);
        router.push(step.href);
      } catch (e) {
        toast.error(e instanceof Error ? e.message.split("\n")[0] : "Could not switch persona");
      } finally {
        setGoing(false);
      }
    },
    [busy, demo, router],
  );

  const value = useMemo<TourCtx>(
    () => ({
      active: state.active,
      index: state.index,
      step: state.active ? TOUR[state.index] : undefined,
      going,
      start: () => void go(0),
      stop: () => setState((s) => ({ ...s, active: false })),
      go,
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
    <Button variant="brand" size="sm" onClick={start} disabled={going}>
      {going ? <Loader2 className="animate-spin" /> : <Route />}
      <span className="hidden sm:inline">Demo Tour</span>
    </Button>
  );
}

export function TourPanel() {
  const { active, index, step, stop, go, going } = useTour();
  const path = usePathname();
  const busy = useAnyBusy();
  if (!active || !step) return null;
  const p = personaById(step.persona);
  const here = path === step.href.split("?")[0];

  return (
    <aside
      aria-label="Demo Tour"
      className="bg-card animate-in fade-in-0 slide-in-from-bottom-3 fixed inset-x-3 bottom-16 z-40 rounded-[14px] p-5 shadow-[0_8px_30px_rgb(0_0_0/0.18)] duration-150 sm:right-8 sm:bottom-20 sm:left-auto sm:w-[26rem]"
    >
      <div className="flex items-start gap-3">
        <ol className="mt-1 flex gap-1" aria-label="Tour progress">
          {TOUR.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === index ? "step" : undefined}
                disabled={going || busy}
                onClick={() => go(i)}
                className={cn(
                  "block h-2 w-6 rounded-full transition-colors",
                  i < index ? "bg-foreground/70" : i === index ? "bg-select" : "bg-foreground/15",
                )}
              />
            </li>
          ))}
        </ol>
        <button type="button" onClick={stop} className="text-muted-foreground hover:text-foreground ml-auto rounded-full" aria-label="Close tour">
          <X className="size-4" />
        </button>
      </div>
      <p className="text-muted-foreground mt-3 text-sm">
        Step {index + 1} of {TOUR.length} · {p.role} · demo account: {p.name}
      </p>
      <h2 className="mt-0.5 text-xl font-semibold">{step.title}</h2>
      <p className="mt-1 text-[15px] text-pretty">{step.doThis}</p>
      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={index === 0 || going || busy}
          onClick={() => go(index - 1)}
        >
          <ChevronLeft />
          Back
        </Button>
        {!here ? (
          <Button size="sm" variant="brand" className="ml-auto" disabled={going || busy} onClick={() => go(index)}>
            {going && <Loader2 className="animate-spin" />}
            Go to {p.role}
          </Button>
        ) : index < TOUR.length - 1 ? (
          <Button size="sm" variant="brand" className="ml-auto" disabled={going || busy} onClick={() => go(index + 1)}>
            {going && <Loader2 className="animate-spin" />}
            Next: {TOUR[index + 1].title}
            <ChevronRight />
          </Button>
        ) : (
          <Button size="sm" variant="brand" className="ml-auto" onClick={stop}>
            Finish tour
          </Button>
        )}
      </div>
    </aside>
  );
}
