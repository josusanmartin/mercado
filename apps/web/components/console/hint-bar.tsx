"use client";
// Bottom hint bar: the honesty line on the left (SPEC §6: always visible, phones included) and the
// button hints on the right. Hints are real: they work with the keyboard and can be clicked.
import { usePathname, useRouter } from "next/navigation";
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { useTour } from "@/components/tour/demo-tour";

function Glyph({ k }: { k: string }) {
  return (
    <span className="bg-foreground text-background grid size-5 place-items-center rounded-full text-[11px] font-semibold" aria-hidden>
      {k}
    </span>
  );
}

export function HintBar() {
  const router = useRouter();
  const path = usePathname();
  const tour = useTour();
  return (
    <footer className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-[90rem] items-center gap-4 px-4 py-2.5 sm:px-8">
        <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-snug sm:text-sm">
          <span className="text-foreground whitespace-nowrap">
            <span className="bg-success mr-1.5 inline-block size-2 rounded-full align-middle" />
            Tempo Moderato {TEMPO_MODERATO_CHAIN_ID}
          </span>{" "}
          · Testnet prototype · OUSD has no real value · xMXN is not redeemable for pesos
        </p>
        <div className="hidden shrink-0 items-center gap-5 text-sm md:flex">
          <span className="flex items-center gap-1.5">
            <Glyph k="A" /> Open
          </span>
          <button type="button" className="flex items-center gap-1.5 rounded-full" onClick={() => path !== "/" && router.push("/")}>
            <Glyph k="B" /> Back
          </button>
          <button type="button" className="flex items-center gap-1.5 rounded-full" onClick={() => (tour.active ? tour.stop() : tour.start())}>
            <Glyph k="+" /> {tour.active ? "End tour" : "Demo Tour"}
          </button>
        </div>
      </div>
    </footer>
  );
}
