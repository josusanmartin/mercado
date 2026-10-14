"use client";
// PhoneFrame: the shared Android device for every in-phone app (Remesas, Crédito driver app, Card, Invest).
// Implementation lives in the mobile kit (@/components/mobile, owned by mobile): a generic Android 15 phone
// with punch-hole camera, live status bar and gesture handle, Inter Tight + Archivo Black inside. Below 640px the app runs
// full-screen with no frame. Pass `accent` (--m-accent) and `theme` ("paper" | "ink").
import type { ReactNode } from "react";
import { AndroidDevice } from "@/components/mobile/device";

export function PhoneFrame({
  children,
  label,
  accent,
  statusBar,
  theme,
}: {
  children: ReactNode;
  label?: string;
  accent?: string;
  statusBar?: string;
  theme?: "paper" | "ink";
}) {
  return (
    <AndroidDevice label={label} accent={accent} statusBar={statusBar} theme={theme}>
      {children}
    </AndroidDevice>
  );
}

/** @deprecated use PhoneFrame */
export const AndroidFrame = PhoneFrame;
