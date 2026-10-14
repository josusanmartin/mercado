"use client";
// PhoneFrame: a generic Android phone (no brand, no iPhone notch): thin bezel, punch-hole camera,
// Android status bar and gesture bar. Below 640px the app runs full-screen with no frame (it IS the
// phone). Used by Mercado Remesas and the Crédito driver app. Put a scrollable app inside; the screen
// is 340×710 on desktop and keeps a white background.
import type { ReactNode } from "react";
import { BatteryMedium, Signal, Wifi } from "lucide-react";
import { useNow } from "@/lib/use-now";

export function PhoneFrame({ children, label = "Android phone preview" }: { children: ReactNode; label?: string }) {
  const now = useNow(15_000);
  const time = now ? new Date(now * 1000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  return (
    <>
      <div className="sm:hidden">{children}</div>
      <div className="hidden sm:block">
        <div className="relative mx-auto w-[360px] rounded-[2.6rem] bg-[#111418] p-[10px] shadow-[0_30px_60px_-30px_rgb(21_17_14/0.6)]" role="group" aria-label={label}>
          <div className="relative flex h-[740px] flex-col overflow-hidden rounded-[2.1rem] bg-[#ffffff] text-[#111418]">
            {/* status bar */}
            <div className="relative flex h-8 shrink-0 items-center justify-between px-6 text-[12px] font-medium tabular">
              <span>{time}</span>
              <span className="absolute top-2 left-1/2 size-[14px] -translate-x-1/2 rounded-full bg-[#111418]" aria-hidden />
              <span className="flex items-center gap-1" aria-hidden>
                <Signal className="size-3.5" />
                <Wifi className="size-3.5" />
                <BatteryMedium className="size-4" />
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            {/* gesture navigation bar */}
            <div className="flex h-6 shrink-0 items-center justify-center" aria-hidden>
              <span className="h-1 w-28 rounded-full bg-[#111418]/80" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** @deprecated use PhoneFrame */
export const AndroidFrame = PhoneFrame;
