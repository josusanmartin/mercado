"use client";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="light"
    className="toaster group"
    style={{ "--normal-bg": "var(--card)", "--normal-text": "var(--card-foreground)", "--normal-border": "var(--border)" } as React.CSSProperties}
    {...props}
  />
);

export { Toaster };
