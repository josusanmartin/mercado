"use client";
// Honesty footer, visible on every screen and width (SPEC §6).
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";

export function HintBar() {
  return (
    <footer className="bg-background/95 fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 border-t lg:sticky lg:bottom-0 lg:z-20">
      <p className="text-muted-foreground mx-auto max-w-[84rem] px-4 py-2 text-xs leading-snug sm:px-8">
        <span className="text-foreground font-medium">
          <span className="bg-success mr-1.5 inline-block size-2 rounded-full align-middle" />
          Tempo Moderato {TEMPO_MODERATO_CHAIN_ID}
        </span>{" "}
        · Testnet prototype · OUSD has no real value · xMXN is not redeemable for pesos
      </p>
    </footer>
  );
}
