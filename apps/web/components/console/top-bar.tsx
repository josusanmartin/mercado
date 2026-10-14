"use client";
// Top bar: network chip, Demo mode toggle and the wallet button. No persona picker: in Demo mode
// each product uses its own demo account (see demo-mode.tsx).
import { useConnection } from "wagmi";
import { Wallet } from "lucide-react";
import { useAnyBusy } from "@/lib/busy";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NetworkBadge } from "@/components/shell/network-badge";
import { WalletDialog } from "@/components/wallet/wallet-menu";
import { personaByAddress } from "@/components/wallet/personas";
import { PersonaRestore } from "@/components/wallet/use-persona";
import { useDemoMode } from "./demo-mode";

export function TopBar() {
  const { on, setOn } = useDemoMode();
  const busy = useAnyBusy();
  const { address, isConnected } = useConnection();
  const persona = personaByAddress(address);
  return (
    <div className="ml-auto flex items-center gap-2 sm:gap-3">
      {on && <PersonaRestore />}
      <NetworkBadge className="hidden sm:inline-flex" />
      <label className={cn("bg-well flex cursor-pointer items-center gap-2 rounded-[12px] px-3 py-1.5 text-sm", busy && "cursor-not-allowed opacity-60")}>
        <span className="hidden sm:inline">Demo mode</span>
        <span className="sm:hidden">Demo</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Demo mode: use testnet demo accounts"
          disabled={busy}
          onClick={() => setOn(!on)}
          className={cn("relative h-5 w-9 rounded-full transition-colors duration-150", on ? "bg-success" : "bg-input")}
        >
          <span className={cn("bg-card absolute top-0.5 size-4 rounded-full shadow transition-[left] duration-150", on ? "left-[18px]" : "left-0.5")} />
        </button>
      </label>
      <WalletDialog>
        <button type="button" disabled={busy} className="bg-ink text-page flex h-9 items-center gap-2 rounded-[12px] px-3 text-sm font-semibold whitespace-nowrap disabled:opacity-60">
          <Wallet className="size-4" aria-hidden />
          {isConnected ? (
            <span className="tabular">
              {persona ? <span className="hidden md:inline">{persona.name} · </span> : null}
              {shortAddr(address)}
            </span>
          ) : (
            <>
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">Connect wallet</span>
            </>
          )}
        </button>
      </WalletDialog>
    </div>
  );
}

/** @deprecated The persona bar is gone (DESIGN-ECOSYSTEM); kept so old imports compile. */
export const ProfileBar = TopBar;
