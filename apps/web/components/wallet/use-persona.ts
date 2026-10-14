"use client";
// Connect a Demo Tour persona through wagmi's Tempo secp256k1 connector, so every screen and hook
// sees it as an ordinary connected wallet.
import { useCallback, useEffect, useRef } from "react";
import { useConfig, useConnection } from "wagmi";
import { connect, disconnect } from "wagmi/actions";
import { dangerous_secp256k1 } from "wagmi/tempo";
import { CHAIN_ID } from "@/lib/contracts/addresses";
import { NO_MPP_POLYFILL } from "@/lib/tempo/config";
import { personaByAddress, personaById, type PersonaId } from "./personas";

export function usePersona() {
  const config = useConfig();
  const { address, connector } = useConnection();
  const persona = personaByAddress(address);
  const local = connector?.type === "secp256k1";
  // Active only when it signs with the local demo key. After a reload the `accounts` provider can
  // restore a persona's address under the Tempo Wallet connector, whose writes open the tempo.xyz
  // dialog instead; that session is "stale" and gets reconnected with the key (see PersonaRestore).
  const active = persona && local ? persona : undefined;
  const stale = persona && !local ? persona : undefined;

  const switchTo = useCallback(
    async (id: PersonaId) => {
      const p = personaById(id);
      if (!p.privateKey) throw new Error(`Demo key for ${p.role} is missing (NEXT_PUBLIC_DEMO_* in apps/web/.env.local).`);
      if (active?.id === id) return;
      await disconnect(config).catch(() => {});
      await connect(config, {
        connector: dangerous_secp256k1({ privateKey: p.privateKey, name: `Demo · ${p.name}`, ...NO_MPP_POLYFILL }),
        chainId: CHAIN_ID,
      });
    },
    [config, active?.id],
  );

  return { active, stale, switchTo };
}

/** Mounted once in the shell: silently re-attach a restored persona session to its local demo key. */
export function PersonaRestore() {
  const { stale, switchTo } = usePersona();
  const tried = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!stale || tried.current === stale.id) return;
    tried.current = stale.id;
    void switchTo(stale.id).catch(() => {});
  }, [stale, switchTo]);
  return null;
}
