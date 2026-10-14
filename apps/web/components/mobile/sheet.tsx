"use client";
// Modal bottom sheet, rendered inside the phone screen (portal into AndroidDevice's overlay host).
// Scrim tap / Escape / drag-down closes it; it animates out before unmounting.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useLockScroll, useOverlayHost } from "./device";

export function BottomSheet({
  open,
  onClose,
  title,
  sub,
  children,
  dismissable = true,
  ariaLabel,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  /** false while something irreversible is in flight (signing, paying). */
  dismissable?: boolean;
  /** Accessible name for the dialog (defaults to a string title, then the sub). */
  ariaLabel?: string;
  className?: string;
}) {
  const host = useOverlayHost();
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setDrag(0);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => setMounted(false), 180);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && dismissable && onClose();
    window.addEventListener("keydown", k);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open, dismissable, onClose]);
  useLockScroll(open);

  if (!mounted || !host) return null;
  return createPortal(
    <div className="absolute inset-0 flex flex-col justify-end">
      <div data-closing={closing || undefined} className="m-scrim absolute inset-0" onClick={() => dismissable && onClose()} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : typeof sub === "string" ? sub : undefined)}
        tabIndex={-1}
        data-closing={closing || undefined}
        className={cn(
          "m-sheet relative max-h-[92%] overflow-y-auto rounded-t-[8px] bg-[var(--m-surface)] pb-6 outline-none sm:pb-8",
          className,
        )}
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
      >
        <div
          className="sticky top-0 z-10 grid h-9 cursor-grab touch-none place-items-center bg-[var(--m-surface)]"
          onPointerDown={(e) => {
            if (!dismissable) return;
            start.current = e.clientY;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => start.current !== null && setDrag(Math.max(0, e.clientY - start.current))}
          onPointerUp={() => {
            if (drag > 90) onClose();
            else setDrag(0);
            start.current = null;
          }}
          aria-hidden
        >
          <span className="h-1 w-8 rounded-full bg-[var(--m-on-surface-variant)] opacity-50" />
        </div>
        {(title || sub) && (
          <div className="px-6 pb-3">
            {sub && <p className="m-meta mb-2">{sub}</p>}
            {title && <h3 className="m-display text-[28px]">{title}</h3>}
          </div>
        )}
        {children}
      </div>
    </div>,
    host,
  );
}
