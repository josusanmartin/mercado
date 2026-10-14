"use client";
// Honesty footer, visible on every screen and width (SPEC §6).
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";

export function HintBar() {
  return (
    <footer data-phone-hide className="bg-background/95 fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 border-t lg:sticky lg:bottom-0 lg:z-20">
      <p className="meta text-muted-foreground mx-auto max-w-[84rem] px-4 py-2 sm:px-8">
        <span className="text-foreground">
          <span className="bg-success mr-1.5 inline-block size-1.5 align-middle" />
          Tempo Moderato {TEMPO_MODERATO_CHAIN_ID}
        </span>{" "}
        · Testnet prototype · sin valor real · OUSD has no real value · xMXN is not redeemable for pesos
      </p>
    </footer>
  );
}
