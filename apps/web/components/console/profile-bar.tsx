"use client";
// Top bar: persona avatars on the left (click to switch the connected demo persona; the active one is
// ringed), and quiet status on the right: network chip, xMXN balance readout, clock.
import { useConnection } from "wagmi";
import { BatteryMedium, Loader2, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { useBalances } from "@/lib/contracts";
import { useAnyBusy } from "@/lib/busy";
import { fmtAmount, shortAddr } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { PERSONAS, type PersonaId } from "@/components/wallet/personas";
import { usePersona } from "@/components/wallet/use-persona";
import { WalletDialog } from "@/components/wallet/wallet-menu";
import { NetworkBadge } from "@/components/shell/network-badge";
import { useState } from "react";

export function ProfileBar() {
  const { address, isConnected, connector } = useConnection();
  const { active, switchTo } = usePersona();
  const busy = useAnyBusy();
  const [pending, setPending] = useState<PersonaId>();
  const bal = useBalances();
  const now = useNow(15_000);
  const otherWallet = isConnected && !active;

  async function pick(id: PersonaId) {
    if (busy) return toast.warning("Wait for the current transaction to finish first.");
    setPending(id);
    try {
      await switchTo(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message.split("\n")[0] : "Could not switch persona");
    } finally {
      setPending(undefined);
    }
  }

  return (
    <div className="flex items-center gap-3 sm:gap-6">
      <nav aria-label="Profiles" data-nav="row" className="scrollbar-none -my-2 flex min-w-0 items-center gap-2 overflow-x-auto py-2 pl-1 sm:gap-3">
        {PERSONAS.map((p) => {
          const on = active?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              data-nav-item=""
              data-active={on ? "true" : undefined}
              disabled={busy || !p.privateKey}
              onClick={() => pick(p.id)}
              aria-pressed={on}
              aria-label={`${p.name}, ${p.role}${on ? " (active)" : ""}`}
              title={`${p.name} · ${p.role} · testnet demo key`}
              className={cn(
                "bg-card shadow-tile relative grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold transition-transform duration-150 hover:scale-105 disabled:opacity-60 sm:size-12",
                on && "outline-select outline-[3px] outline-offset-2 outline-solid",
              )}
            >
              {pending === p.id ? <Loader2 className="size-4 animate-spin" /> : p.name.slice(0, 1)}
            </button>
          );
        })}
        <WalletDialog>
          <button
            type="button"
            data-nav-item=""
            aria-label={otherWallet ? `Wallet ${shortAddr(address)}` : "Other wallets"}
            title={otherWallet ? `${connector?.name} ${shortAddr(address)}` : "Tempo Wallet, passkey or browser wallet"}
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-current/30 sm:size-12",
              otherWallet && "outline-select bg-card border-solid outline-[3px] outline-offset-2 outline-solid",
            )}
          >
            {otherWallet ? <Wallet className="size-5 stroke-[1.5]" /> : <Plus className="size-5 stroke-[1.5]" />}
          </button>
        </WalletDialog>
        <span className="text-muted-foreground hidden min-w-0 truncate text-sm xl:inline">
          {active ? `${active.name} · ${active.role}` : otherWallet ? shortAddr(address) : "Pick a profile"}
        </span>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-3 text-sm sm:gap-5">
        <NetworkBadge className="hidden md:inline-flex" />
        {isConnected && (
          <span className="hidden items-center gap-1.5 tabular sm:flex" title="xMXN balance">
            <BatteryMedium className="size-5 stroke-[1.5]" aria-hidden />
            {fmtAmount(bal.xmxn, 0)} <span className="text-muted-foreground">xMXN</span>
          </span>
        )}
        <span className="hidden text-base font-medium tabular sm:inline" suppressHydrationWarning>
          {now ? new Date(now * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}
        </span>
      </div>
    </div>
  );
}

export const NETWORK_LABEL = `Moderato ${TEMPO_MODERATO_CHAIN_ID}`;
