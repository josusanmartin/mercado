"use client";
// The desktop "what just happened / what's real here" column beside a phone app. On desktop it is
// always open; on a real phone (<640px) it collapses below the full-screen app into one disclosure.
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function PhonePanel({ children, summary = "Cómo funciona · What's real here", className }: { children: ReactNode; summary?: string; className?: string }) {
  const [small, setSmall] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setSmall(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (!small) return <div className={className}>{children}</div>;
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className={cn("group border-t", className)}>
      <summary className="meta flex h-14 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid content-start gap-8 pb-6">{children}</div>
    </details>
  );
}
