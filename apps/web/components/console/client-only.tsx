"use client";
// Wallet state is restored from browser storage before React hydrates, so anything that depends on it
// can't match the server HTML. Render such subtrees only on the client (after hydration) to avoid
// hydration mismatches; the server and the first client render both show `fallback`.
import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};

export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return useHydrated() ? <>{children}</> : <>{fallback}</>;
}
