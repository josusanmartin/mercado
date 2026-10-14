"use client";
// Connect a Demo Tour persona through wagmi's Tempo secp256k1 connector, so every screen and hook
// sees it as an ordinary connected wallet.
import { useCallback } from "react";
import { useConfig, useConnection } from "wagmi";
import { connect, disconnect } from "wagmi/actions";
import { dangerous_secp256k1 } from "wagmi/tempo";
import { CHAIN_ID } from "@/lib/contracts/addresses";
import { personaByAddress, personaById, type PersonaId } from "./personas";

export function usePersona() {
  const config = useConfig();
  const { address, connector } = useConnection();
  const active = connector?.type === "secp256k1" ? personaByAddress(address) : undefined;

  const switchTo = useCallback(
    async (id: PersonaId) => {
      const p = personaById(id);
      if (!p.privateKey) throw new Error(`Demo key for ${p.role} is missing (NEXT_PUBLIC_DEMO_* in apps/web/.env.local).`);
      if (active?.id === id) return;
      await disconnect(config).catch(() => {});
      await connect(config, {
        connector: dangerous_secp256k1({ privateKey: p.privateKey, name: `Demo · ${p.name}` }),
        chainId: CHAIN_ID,
      });
    },
    [config, active?.id],
  );

  return { active, switchTo };
}
