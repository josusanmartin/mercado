"use client";
// PhoneFrame: the shared Android device for every in-phone app (Remesas, Crédito driver app, Card, Invest).
// Implementation lives in the mobile kit (@/components/mobile, owned by mobile): a generic Android 15 phone
// with punch-hole camera, live status bar and gesture handle, Roboto inside. Below 640px the app runs
// full-screen with no frame. Pass `accent` to theme the kit (--m-accent).
import type { ReactNode } from "react";
import { AndroidDevice } from "@/components/mobile/device";

export function PhoneFrame({ children, label, accent, statusBar }: { children: ReactNode; label?: string; accent?: string; statusBar?: string }) {
  return (
    <AndroidDevice label={label} accent={accent} statusBar={statusBar}>
      {children}
    </AndroidDevice>
  );
}

/** @deprecated use PhoneFrame */
export const AndroidFrame = PhoneFrame;
