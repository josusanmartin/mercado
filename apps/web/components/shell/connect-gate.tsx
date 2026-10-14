"use client";
// Shown in place of an action panel when no wallet is connected (or it's on the wrong chain).
import type { ReactNode } from "react";
import { useConnection, useSwitchChain } from "wagmi";
import { toast } from "sonner";
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { Button } from "@/components/ui/button";
import { personaById, type PersonaId } from "@/components/wallet/personas";
import { usePersona } from "@/components/wallet/use-persona";

export function ConnectGate({ persona, children, why }: { persona: PersonaId; why: string; children: ReactNode }) {
  const { isConnected, chainId } = useConnection();
  const { switchTo } = usePersona();
  const { mutate: switchChain } = useSwitchChain();
  const p = personaById(persona);

  if (isConnected && chainId !== undefined && chainId !== TEMPO_MODERATO_CHAIN_ID)
    return (
      <div className="bg-muted grid gap-3 rounded-[14px] p-6 text-[15px]">
        <p>Your wallet is on another network. Mercado runs on Tempo Moderato (chain {TEMPO_MODERATO_CHAIN_ID}).</p>
        <Button className="justify-self-start" onClick={() => switchChain({ chainId: TEMPO_MODERATO_CHAIN_ID })}>
          Switch to Tempo Moderato
        </Button>
      </div>
    );

  if (isConnected) return <>{children}</>;

  return (
    <div className="bg-muted grid gap-4 rounded-[14px] p-6">
      <p className="text-[15px]">{why}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          className="h-auto min-h-12 py-2 text-left whitespace-normal"
          disabled={!p.privateKey}
          onClick={() => switchTo(persona).catch((e) => toast.error(String(e?.message ?? e).split("\n")[0]))}
        >
                    Continue as {p.name} ({p.role})
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">Demo personas use testnet demo keys with no real value. Or pick another profile at the top.</p>
    </div>
  );
}
