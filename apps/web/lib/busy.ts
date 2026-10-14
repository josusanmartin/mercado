"use client";
// App-wide "a transaction flow is in flight" flag, so the wallet menu and Demo Tour can't switch
// accounts mid-flow (R-012). Screens report via useReportBusy(tx.isBusy).
import { useEffect, useSyncExternalStore } from "react";

let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useReportBusy(busy: boolean) {
  useEffect(() => {
    if (!busy) return;
    count++;
    emit();
    return () => {
      count--;
      emit();
    };
  }, [busy]);
}

export function useAnyBusy() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => count > 0,
    () => false,
  );
}
