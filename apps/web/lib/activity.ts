"use client";
// Per-browser log of confirmed transactions (Home → "Recent receipts"). Explorer links are the proof;
// this is only a convenience index of what this browser did, keyed by account.
import { useSyncExternalStore } from "react";
import type { Address, Hash } from "viem";

export type Activity = { hash: Hash; label: string; account: Address; at: number; url: string };

const KEY = "mercado.activity.v1";
const listeners = new Set<() => void>();
let cache: Activity[] | undefined;
const EMPTY: Activity[] = [];

function read(): Activity[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Activity[];
  } catch {
    cache = [];
  }
  return cache;
}

export function recordActivity(a: Activity) {
  const all = read();
  if (all.some((x) => x.hash === a.hash)) return;
  cache = [a, ...all].slice(0, 100);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
  listeners.forEach((l) => l());
}

export function useActivity(account?: Address) {
  const all = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => EMPTY,
  );
  return account ? all.filter((a) => a.account.toLowerCase() === account.toLowerCase()) : all;
}
