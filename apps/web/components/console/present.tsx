"use client";
// Capture-only presentation mode (lead 03:38): '?present=1' hides in-app honesty labels and the footer, for
// deck screenshots ONLY. Persisted for the tab (sessionStorage); '?present=0' turns it off. Without the flag
// every label renders exactly as before (MOCKS.md unchanged).
//
// How labels opt in: put `data-honesty` on the element (or wrap text in <Honesty>); the rule below hides
// it under html[data-present], as do the "mock" Badges (SIMULATED, Demo, Admin relay). For labels built from joined string parts, filter with usePresent().
// Include a leading " · " separator INSIDE the hidden span so no dangling dot is left behind.
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

const KEY = "mercado.present";
const ATTR = "data-present";

function read(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute(ATTR);
}
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });
  return () => mo.disconnect();
}

const RULE = `html[${ATTR}] [data-honesty], html[${ATTR}] [data-slot="badge"][data-variant="mock"] { display: none !important; }`;

/** Mounted once in the dashboard layout: applies ?present=1|0 and the tab's saved choice. */
export function PresentMode() {
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("present");
      if (q === "1") sessionStorage.setItem(KEY, "1");
      if (q === "0") sessionStorage.removeItem(KEY);
      if (sessionStorage.getItem(KEY) === "1") document.documentElement.setAttribute(ATTR, "");
      else document.documentElement.removeAttribute(ATTR);
    } catch {}
  }, []);
  return <style>{RULE}</style>;
}

/** True while capture mode is on (for labels assembled from string parts). */
export function usePresent(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Honesty text that capture mode hides. */
export function Honesty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span data-honesty className={className}>
      {children}
    </span>
  );
}
