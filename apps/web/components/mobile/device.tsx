"use client";
// A generic modern Android phone (no Pixel/Samsung branding, no iPhone cues): slim bezel with a metal
// rim, centered punch-hole camera, Android 15-style status bar (live clock, wifi, signal, battery),
// gesture handle, side keys and a faint glass sheen. Below 640px the app IS the phone: no frame, no
// fake status bar, and sheets/snackbars cover the real viewport.
// The children render once (one React tree for both sizes), so app state never splits.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { roboto } from "./font";
import "./mobile.css";

type Snack = { id: number; text: string; action?: { label: string; onClick: () => void }; closing?: boolean };
type DeviceCtx = { overlay: HTMLElement | null; snack: (text: string, action?: Snack["action"]) => void };
const Ctx = createContext<DeviceCtx>({ overlay: null, snack: () => {} });

/** Where in-phone overlays (bottom sheets, dialogs) portal to. */
export const useOverlayHost = () => useContext(Ctx).overlay;
/** Show an M3 snackbar at the bottom of the phone screen. */
export const useSnackbar = () => useContext(Ctx).snack;

export function AndroidDevice({
  children,
  label = "Android phone preview",
  accent,
  statusBar = "#ffffff",
}: {
  children: ReactNode;
  label?: string;
  /** App accent (sets --m-accent for the kit). */
  accent?: string;
  /** Status bar background, to match the app's top surface. */
  statusBar?: string;
}) {
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const seq = useRef(0);
  const snack = useCallback((text: string, action?: Snack["action"]) => {
    const id = ++seq.current;
    setSnacks([{ id, text, action }]);
    setTimeout(() => setSnacks((s) => s.map((x) => (x.id === id ? { ...x, closing: true } : x))), 3800);
    setTimeout(() => setSnacks((s) => s.filter((x) => x.id !== id)), 4000);
  }, []);
  const style = accent ? ({ "--m-accent": accent } as CSSProperties) : undefined;
  // On a real phone the overlays live on <body> so they cover the site's sticky chrome too.
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setSmall(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const layers = (
    <>
      {/* overlays: sheets portal here */}
      <div ref={setOverlay} className="pointer-events-none absolute inset-0 z-40 [&>*]:pointer-events-auto" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 grid justify-items-center px-3 pb-4 sm:pb-8" aria-live="polite">
        {snacks.map((s) => (
          <div
            key={s.id}
            data-closing={s.closing || undefined}
            className="m-snack pointer-events-auto flex min-h-12 w-full items-center gap-2 rounded-[6px] bg-[#2f3036] py-2 pr-2 pl-4 text-[14px] text-[#f2f0f4] shadow-[0_6px_16px_rgb(0_0_0/0.25)]"
          >
            <span className="flex-1">{s.text}</span>
            {s.action && (
              <button type="button" onClick={s.action.onClick} className="h-10 rounded-full px-3 text-[14px] font-medium text-[#ffb68a]">
                {s.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <Ctx.Provider value={{ overlay, snack }}>
      <div className="relative sm:mx-auto sm:w-[360px] sm:pb-1" role="group" aria-label={label}>
        {/* side keys: power + volume rocker on the right edge */}
        <span aria-hidden className="absolute top-[150px] -right-[3px] hidden h-[62px] w-[4px] rounded-r-[3px] bg-gradient-to-b from-[#3b4048] via-[#272a30] to-[#3b4048] sm:block" />
        <span aria-hidden className="absolute top-[236px] -right-[3px] hidden h-[104px] w-[4px] rounded-r-[3px] bg-gradient-to-b from-[#3b4048] via-[#272a30] to-[#3b4048] sm:block" />
        {/* body: metal rim + black bezel */}
        <div className="sm:rounded-[46px] sm:bg-gradient-to-br sm:from-[#4a4f58] sm:via-[#1b1d22] sm:to-[#3a3e46] sm:p-[2px] sm:shadow-[0_2px_4px_rgb(0_0_0/0.12),0_28px_60px_-24px_rgb(17_20_24/0.55),0_60px_90px_-50px_rgb(17_20_24/0.35)]">
          <div className="sm:rounded-[44px] sm:bg-[#07080a] sm:p-[7px]">
            <div
              className={cn(
                roboto.variable,
                "m-root relative flex flex-col overflow-hidden sm:h-[766px] sm:rounded-[37px]",
              )}
              style={style}
            >
              <StatusBar bg={statusBar} />
              <div className="m-scroll relative min-h-0 flex-1 sm:overflow-y-auto sm:pb-5">{children}</div>
              {/* gesture navigation handle (edge-to-edge, over the app) */}
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-30 hidden h-5 items-center justify-center sm:flex">
                <span className="h-[4px] w-[108px] rounded-full bg-[#15171b]/85" />
              </div>
              {!small && layers}
              {/* glass sheen + camera, above everything */}
              <div aria-hidden className="pointer-events-none absolute inset-0 z-[80] hidden bg-[linear-gradient(118deg,rgb(255_255_255/0.07)_0%,rgb(255_255_255/0.02)_28%,transparent_42%)] mix-blend-screen sm:block" />
              <span
                aria-hidden
                className="absolute top-[9px] left-1/2 z-[90] hidden size-[13px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#2c3440_0%,#0b0d10_45%,#000_100%)] shadow-[0_0_0_1.5px_#050506] sm:block"
              />
            </div>
          </div>
        </div>
      </div>
      {small &&
        createPortal(
          <div className={cn(roboto.variable, "m-root pointer-events-none fixed inset-0 z-[100] !bg-transparent")} style={style}>
            {layers}
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

function StatusBar({ bg }: { bg: string }) {
  const now = useNow(10_000);
  // Android's 24h status-bar clock has no leading zero ("9:41", "14:05"); viewer's local time.
  const d = now ? new Date(now * 1000) : undefined;
  const time = d ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` : "";
  return (
    <div
      className="relative z-20 hidden h-[34px] shrink-0 items-center justify-between pr-5 pl-6 text-[13.5px] font-medium tracking-[0.01em] text-[#15171b] sm:flex"
      style={{ background: bg }}
      aria-hidden
    >
      <span className="m-num min-w-10">{time}</span>
      <span className="flex items-center gap-[5px]">
        <WifiIcon />
        <SignalIcon />
        <BatteryIcon level={0.78} />
        <span className="m-num -ml-0.5 text-[12.5px]">78%</span>
      </span>
    </div>
  );
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[15px]" fill="currentColor">
      <path d="M12 21 .6 7.4A17.4 17.4 0 0 1 12 3.2c4.3 0 8.3 1.6 11.4 4.2L12 21Z" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[14px]" fill="currentColor">
      <path d="M2 22 22 2v20H2Z" />
    </svg>
  );
}

function BatteryIcon({ level }: { level: number }) {
  const h = Math.round(15 * level);
  return (
    <svg viewBox="0 0 12 20" className="h-[15px] w-[9px]">
      <rect x="4" y="0.5" width="4" height="2" rx="0.6" fill="currentColor" />
      <rect x="0.9" y="2.4" width="10.2" height="17" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
      <rect x="2.3" y={3.8 + (15 - h)} width="7.4" height={h} rx="0.8" fill="currentColor" />
    </svg>
  );
}

/** Lock body scroll while a sheet is open on a real phone (desktop frame scroll is local). */
export function useLockScroll(on: boolean) {
  useEffect(() => {
    if (!on || window.matchMedia("(min-width: 640px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [on]);
}

/** Portal helper for in-phone overlays. */
export function InPhone({ children }: { children: ReactNode }) {
  const host = useOverlayHost();
  return host ? createPortal(children, host) : null;
}
