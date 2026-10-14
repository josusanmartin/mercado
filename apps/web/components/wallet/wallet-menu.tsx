"use client";
import { useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { Fingerprint, Globe, KeyRound, Loader2, LogOut, Wallet } from "lucide-react";
import { toast } from "sonner";
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAnyBusy } from "@/lib/busy";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PERSONAS, type PersonaId } from "./personas";
import { rememberPersona, usePersona } from "./use-persona";
import { tempoWallet, webAuthn } from "wagmi/tempo";
import { NO_MPP_POLYFILL } from "@/lib/tempo/config";

export function WalletMenu() {
  const [open, setOpen] = useState(false);
  const { address, chainId, isConnected, connector } = useConnection();
  const { active } = usePersona();
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== TEMPO_MODERATO_CHAIN_ID;

  return (
    <div className="flex items-center gap-2">
      {wrongChain && (
        <Button size="sm" variant="destructive" disabled={switching} onClick={() => switchChain({ chainId: TEMPO_MODERATO_CHAIN_ID })}>
          {switching && <Loader2 className="animate-spin" />}
          Switch to Tempo
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {isConnected ? (
            <Button variant="outline" size="sm" className="gap-2 tabular">
              <span className={cn("size-2 rounded-full", active ? "bg-brand" : "bg-success")} />
              {active ? <span>{active.name}</span> : <span className="hidden sm:inline">{connector?.name}</span>}
              <span className="text-muted-foreground">{shortAddr(address)}</span>
            </Button>
          ) : (
            <Button size="sm">
              <Wallet />
              Connect
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <WalletChooser onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The wallet chooser behind any trigger (used by the console ProfileBar). */
export function WalletDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <WalletChooser onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function WalletChooser({ onDone }: { onDone: () => void }) {
  const { isConnected, address } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connect, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { active, switchTo } = usePersona();
  const [personaPending, setPersonaPending] = useState<PersonaId>();
  // Never switch accounts while a transaction flow is in flight (R-012).
  const busy = useAnyBusy();

  const injected = connectors.find((c) => c.type === "injected");
  // Tempo Wallet and Passkey connectors are created on demand (see lib/tempo/config.ts).
  const tempo = () => tempoWallet(NO_MPP_POLYFILL);
  const passkey = () => webAuthn(NO_MPP_POLYFILL);

  const [kind, setKind] = useState<string>();
  async function use(c: (typeof connectors)[number] | ReturnType<typeof tempoWallet> | undefined, k: string) {
    if (!c) return;
    setKind(k);
    try {
      if (isConnected) disconnect();
      rememberPersona(null);
      await connect({ connector: c, chainId: TEMPO_MODERATO_CHAIN_ID });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message.split("\n")[0] : "Could not connect");
    } finally {
      setKind(undefined);
    }
  }

  async function usePersonaAccount(id: PersonaId) {
    setPersonaPending(id);
    try {
      await switchTo(id);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message.split("\n")[0] : "Could not switch persona");
    } finally {
      setPersonaPending(undefined);
    }
  }

  const pendingId = isPending ? kind : undefined;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Choose a wallet</DialogTitle>
        <DialogDescription>Everything runs on Tempo Moderato testnet. Fees are paid in a USD test token or sponsored.</DialogDescription>
      </DialogHeader>
      {busy && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning-ink">
          A transaction is in progress. Wait for it to finish before switching wallets.
        </p>
      )}

      <div className="grid gap-2">
        <WalletOption
          icon={<Globe />}
          title="Tempo Wallet"
          detail="Sign in at tempo.xyz, no extension needed"
          pending={pendingId === "tempoWallet"}
          disabled={busy}
          onClick={() => use(tempo(), "tempoWallet")}
        />
        <WalletOption
          icon={<Fingerprint />}
          title="Passkey"
          detail="A new account secured by Face ID or your fingerprint, no seed phrase"
          pending={pendingId === "webAuthn"}
          disabled={busy}
          onClick={() => use(passkey(), "webAuthn")}
        />
      </div>

      <section aria-labelledby="personas-h" className="rounded-lg border border-dashed p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 id="personas-h" className="text-sm font-semibold">
            Demo personas
          </h3>
          <span className="text-muted-foreground text-xs">Testnet demo keys, no real value</span>
        </div>
        <ul className="grid gap-1">
          {PERSONAS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={busy || !p.privateKey || personaPending !== undefined}
                onClick={() => usePersonaAccount(p.id)}
                className={cn(
                  "hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-50",
                  active?.id === p.id && "bg-accent",
                )}
              >
                <KeyRound className="text-brand size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{p.name}</span> <span className="text-muted-foreground">· {p.role}</span>
                </span>
                {personaPending === p.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <span className="text-muted-foreground text-xs tabular">{shortAddr(p.address)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <WalletOption
        icon={<Wallet />}
        title="Browser wallet"
        detail="MetaMask or another injected wallet"
        pending={pendingId === "injected"}
        disabled={busy || !injected}
        onClick={() => use(injected, "injected")}
      />

      {isConnected && (
        <Button
          variant="ghost"
          disabled={busy}
          className="justify-self-start"
          onClick={() => {
            rememberPersona(null);
            disconnect();
            onDone();
          }}
        >
          <LogOut />
          Disconnect {shortAddr(address)}
        </Button>
      )}
    </>
  );
}

function WalletOption(props: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  pending?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled || props.pending}
      className="hover:border-primary/50 hover:bg-accent/50 flex items-center gap-3 rounded-lg border bg-card p-3 text-left disabled:opacity-50 [&>svg]:size-5"
    >
      <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-md [&>svg]:size-5">{props.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{props.title}</span>
        <span className="text-muted-foreground block text-xs">{props.detail}</span>
      </span>
      {props.pending && <Loader2 className="size-4 animate-spin" />}
    </button>
  );
}
