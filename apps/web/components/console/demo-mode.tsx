"use client";
// Demo mode: instead of picking a persona, each product uses its own testnet demo account
// (Mint → Institución demo, Remesas → Sender (US), Global → Business demo, Crédito → Driver/Lender).
// Off = bring your own wallet (Tempo Wallet, Passkey or a browser wallet).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useConfig, useConnection } from "wagmi";
import { disconnect } from "wagmi/actions";
import { useAnyBusy } from "@/lib/busy";
import { personaById, type PersonaId } from "@/components/wallet/personas";
import { rememberPersona, usePersona } from "@/components/wallet/use-persona";

const KEY = "mercado.demo";
const Ctx = createContext<{ on: boolean; setOn: (v: boolean) => void }>({ on: true, setOn: () => {} });

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [on, setOnState] = useState(true);
  const config = useConfig();
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "off") setOnState(false);
    } catch {}
  }, []);
  const setOn = useCallback(
    (v: boolean) => {
      setOnState(v);
      try {
        localStorage.setItem(KEY, v ? "on" : "off");
      } catch {}
      if (!v) {
        // Leaving demo mode drops the demo account; the visitor connects their own wallet.
        rememberPersona(null);
        void disconnect(config).catch(() => {});
      }
    },
    [config],
  );
  return <Ctx.Provider value={{ on, setOn }}>{children}</Ctx.Provider>;
}

export const useDemoMode = () => useContext(Ctx);

/**
 * In Demo mode, make sure the product's demo account is the connected one (switching if needed,
 * never mid-transaction). Returns the persona in use, if any.
 */
export function useDemoAccount(persona: PersonaId | undefined) {
  const { on } = useDemoMode();
  const { active, switchTo } = usePersona();
  const { status } = useConnection();
  const busy = useAnyBusy();
  const inflight = useRef<PersonaId | undefined>(undefined);
  useEffect(() => {
    if (!on || !persona || busy || status === "connecting" || status === "reconnecting") return;
    if (active?.id === persona || inflight.current === persona) return;
    inflight.current = persona;
    void switchTo(persona)
      .catch(() => {})
      .finally(() => {
        inflight.current = undefined;
      });
  }, [on, persona, active?.id, busy, status, switchTo]);
  return on && persona ? personaById(persona) : undefined;
}
