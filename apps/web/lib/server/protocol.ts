// Server-side view of the active protocol. The ONE source of truth is packages/shared/src/protocol.ts
// (activeAddresses(); NEXT_PUBLIC_MERCADO_PROTOCOL / MERCADO_PROTOCOL, default v1, only lead flips).
// This wrapper only adds fail-closed checks for the addresses each server feature needs: when v2 is
// active but incomplete, the feature errors (503) instead of falling back to v1 or to an env override.
import type { Address } from "viem";
import {
  ACTIVE_PROTOCOL,
  activeAddresses,
  type ProtocolAddresses,
} from "@mercado/shared";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

export class ProtocolUnavailableError extends Error {
  readonly status = 503;
  readonly code = "PROTOCOL_UNAVAILABLE";
}

export function serverAddresses(): ProtocolAddresses {
  try {
    return activeAddresses();
  } catch (e) {
    throw new ProtocolUnavailableError((e as Error).message);
  }
}

/** The named address of the active protocol, or ProtocolUnavailableError if it's missing/invalid. */
export function requireAddress<K extends keyof ProtocolAddresses>(
  key: K,
): Address {
  const a = serverAddresses();
  const v = a[key];
  if (typeof v !== "string" || !ADDR.test(v) || /^0x0{40}$/.test(v))
    throw new ProtocolUnavailableError(
      `Mercado ${a.protocol} has no ${String(key)} deployed.`,
    );
  return v as Address;
}

export const activeProtocolName = () => ACTIVE_PROTOCOL;
