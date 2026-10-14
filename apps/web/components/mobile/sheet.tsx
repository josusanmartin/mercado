"use client";
// Modal bottom sheet, rendered inside the phone screen (portal into AndroidDevice's overlay host).
// Built on Radix Dialog (review a11y P1): focus is trapped inside and restored to the opener on close,
// everything outside is aria-hidden and non-interactive while it's open, it always has an accessible
// title, and a visible close (X, "Ocultar") button. Scrim tap / Escape / drag-down / X close it unless
// `dismissable` is false (something irreversible in flight); it animates out before unmounting.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, VisuallyHidden } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlayHost } from "./device";

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
  /** Accessible name when there's no visible string title (defaults to the sub). */
  ariaLabel?: string;
  className?: string;
}) {
  const host = useOverlayHost();
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  // The element that opened the sheet gets focus back once it has animated out (Radix's own restore
  // runs while we're still mounted for the exit animation, so we do it ourselves).
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      if (!mounted) opener.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      setClosing(false);
      setDrag(0);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => {
        setMounted(false);
        const el = opener.current;
        opener.current = null;
        if (el?.isConnected) requestAnimationFrame(() => el.focus({ preventScroll: true }));
      }, 180);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Latest values for Radix's event handlers: they can fire between a state change (e.g. "signing")
  // and the re-render that makes the sheet non-dismissable.
  const live = useRef({ dismissable, onClose });
  live.current = { dismissable, onClose };

  if (!mounted || !host) return null;
  const close = () => live.current.dismissable && live.current.onClose();
  const hiddenName = ariaLabel ?? (typeof sub === "string" ? sub : "Detalle");

  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal container={host}>
        <Dialog.Overlay data-closing={closing || undefined} className="m-scrim absolute inset-0" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => !live.current.dismissable && e.preventDefault()}
          // Only an explicit tap on the scrim/outside may dismiss. Focus moving (a button swapping to a
          // spinner, a wallet prompt) must NEVER close a sheet: that used to decline Card taps (P0).
          onPointerDownOutside={(e) => !live.current.dismissable && e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          data-closing={closing || undefined}
          className={cn(
            "m-sheet absolute inset-x-0 bottom-0 max-h-[92%] overflow-y-auto rounded-t-[8px] bg-[var(--m-surface)] pb-6 outline-none sm:pb-8",
            className,
          )}
          style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
        >
          <div className="sticky top-0 z-10 flex h-12 items-center justify-center bg-[var(--m-surface)]">
            <div
              className="grid h-full w-24 cursor-grab touch-none place-items-center"
              onPointerDown={(e) => {
                if (!dismissable) return;
                start.current = e.clientY;
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => start.current !== null && setDrag(Math.max(0, e.clientY - start.current))}
              onPointerUp={() => {
                if (drag > 90) close();
                else setDrag(0);
                start.current = null;
              }}
              aria-hidden
            >
              <span className="h-1 w-8 rounded-full bg-[var(--m-on-surface-variant)] opacity-50" />
            </div>
            {dismissable && (
              <Dialog.Close
                aria-label="Ocultar"
                title="Ocultar"
                className="absolute top-0 right-1 grid size-12 place-items-center rounded-full text-[var(--m-on-surface)] hover:bg-[var(--m-surface-2)]"
              >
                <X className="size-5" strokeWidth={1.75} />
              </Dialog.Close>
            )}
          </div>
          {(title || sub) && (
            <div className="px-6 pb-3">
              {sub && <p className="m-meta mb-2">{sub}</p>}
              {title && <Dialog.Title className="m-display text-[28px]">{title}</Dialog.Title>}
            </div>
          )}
          {!title && (
            <VisuallyHidden.Root asChild>
              <Dialog.Title>{hiddenName}</Dialog.Title>
            </VisuallyHidden.Root>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
