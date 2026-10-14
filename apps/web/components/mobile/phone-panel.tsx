"use client";
// The desktop "what just happened / what's real here" column beside a phone app. On desktop it is
// always open; on a real phone (<640px) it collapses below the full-screen app into one disclosure.
// CSS decides which (no JS breakpoint): the server's first paint already has the final layout (v6 CLS gate).
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function PhonePanel({ children, summary = "Cómo funciona · What's real here", className }: { children: ReactNode; summary?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cn("m-phone-panel max-sm:border-t", className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="meta flex h-14 w-full items-center justify-between text-left sm:hidden">
        {summary}
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {/* desktop: display:contents, so the children sit in the caller's grid exactly as before */}
      <div id={id} className={cn("sm:contents", open ? "max-sm:grid max-sm:content-start max-sm:gap-8 max-sm:pb-6" : "max-sm:hidden")}>
        {children}
      </div>
    </div>
  );
}
