"use client";
// Shown in place of an action panel when no wallet is connected (or it's on the wrong chain).
// Demo mode on: the product's demo account connects automatically; this offers a manual retry.
// Demo mode off: connect your own wallet, or turn Demo mode back on.
import type { ReactNode } from "react";
import { useConnection, useSwitchChain } from "wagmi";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { Button } from "@/components/ui/button";
import { personaById, type PersonaId } from "@/components/wallet/personas";
import { usePersona } from "@/components/wallet/use-persona";
import { WalletDialog } from "@/components/wallet/wallet-menu";
import { useDemoMode } from "@/components/console/demo-mode";

export function ConnectGate({ persona, children, why }: { persona: PersonaId; why: string; children: ReactNode }) {
  const { isConnected, chainId, status } = useConnection();
  const { switchTo } = usePersona();
  const { on, setOn } = useDemoMode();
  const { mutate: switchChain } = useSwitchChain();
  const p = personaById(persona);

  if (isConnected && chainId !== undefined && chainId !== TEMPO_MODERATO_CHAIN_ID)
    return (
      <div className="bg-muted grid gap-3 rounded-[12px] p-5 text-[15px]">
        <p>Your wallet is on another network. Mercado runs on Tempo Moderato (chain {TEMPO_MODERATO_CHAIN_ID}).</p>
        <Button className="justify-self-start" onClick={() => switchChain({ chainId: TEMPO_MODERATO_CHAIN_ID })}>
          Switch to Tempo Moderato
        </Button>
      </div>
    );

  if (isConnected) return <>{children}</>;

  const connecting = status === "connecting" || status === "reconnecting";
  return (
    <div className="bg-muted grid min-w-0 gap-4 rounded-[12px] p-5">
      <p className="text-[15px]">{why}</p>
      <div className="flex min-w-0 flex-wrap gap-2">
        {on ? (
          <Button
            className="h-auto min-h-10 max-w-full py-2 text-left whitespace-normal"
            disabled={!p.privateKey || connecting}
            onClick={() => switchTo(persona).catch((e) => toast.error(String(e?.message ?? e).split("\n")[0]))}
          >
            {connecting && <Loader2 className="animate-spin" />}
            Use the demo account: {p.name}
          </Button>
        ) : (
          <>
            <WalletDialog>
              <Button>
                <Wallet />
                Connect wallet
              </Button>
            </WalletDialog>
            <Button variant="outline" onClick={() => setOn(true)}>
              Turn on Demo mode
            </Button>
          </>
        )}
      </div>
      <p className="text-muted-foreground text-xs">Demo accounts use testnet keys with no real value.</p>
    </div>
  );
}
