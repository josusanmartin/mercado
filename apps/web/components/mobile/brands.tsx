"use client";
// Real third-party marks (josu approved; sources + license notes in public/brands/SOURCES.md).
// Rules: original colors and proportions (fixed height, auto width), clear space around the mark,
// always on white, never on the Mercado Card. Every surface that shows one keeps a "not affiliated"
// or "SIMULATED" line nearby.
/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, DemoBadge, Pressable } from "./primitives";
import { BottomSheet } from "./sheet";

export type BrandId = "uber" | "didi" | "rappi" | "telcel" | "cfe";

/** width/height of each file's visible mark, and the height that gives each a similar optical weight. */
const BRANDS: Record<BrandId, { name: string; ratio: number; h: number }> = {
  uber: { name: "Uber", ratio: 24 / 8.8, h: 15 },
  didi: { name: "DiDi", ratio: 99 / 29.41, h: 19 },
  rappi: { name: "Rappi", ratio: 26.458 / 11.1125, h: 22 },
  telcel: { name: "Telcel", ratio: 113 / 32, h: 16 },
  cfe: { name: "CFE", ratio: 1076.373 / 531.119, h: 30 },
};

export const brandName = (id: BrandId) => BRANDS[id].name;

export function BrandLogo({ id, height, className }: { id: BrandId; height?: number; className?: string }) {
  const b = BRANDS[id];
  const h = height ?? b.h;
  return <img src={`/brands/${id}.svg`} alt={b.name} width={Math.round(h * b.ratio)} height={h} draggable={false} className={cn("shrink-0 select-none", className)} style={{ height: h, width: "auto" }} />;
}

/** A logo on a white rounded tile (list leading slot / service grid). */
export function BrandTile({ id, size = 40, className }: { id: BrandId; size?: number; className?: string }) {
  const b = BRANDS[id];
  const h = Math.min(size * 0.42, (size * 0.78) / b.ratio) * (id === "cfe" ? 1.45 : 1);
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-[12px] border border-[var(--m-outline-variant)] bg-white", className)} style={{ width: size, height: size }}>
      <BrandLogo id={id} height={Math.round(h)} />
    </span>
  );
}

/** "Continuar con Uber": white pill, the real mark on the left with clear space, 56dp tall. */
export function PlatformButton({ id, onClick, sub, disabled }: { id: BrandId; onClick: () => void; sub?: ReactNode; disabled?: boolean }) {
  return (
    <Pressable
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 w-full items-center gap-3 rounded-full border border-[var(--m-outline)] bg-white pr-5 pl-2 text-left text-[var(--m-on-surface)] disabled:opacity-40"
    >
      <span className="grid h-10 w-[76px] shrink-0 place-items-center">
        <BrandLogo id={id} />
      </span>
      <span className="flex-1 text-[16px] font-medium">Continuar con {BRANDS[id].name}</span>
      {sub && <span className="text-[13px] text-[var(--m-on-surface-variant)]">{sub}</span>}
    </Pressable>
  );
}

/**
 * The simulated OAuth hand-off as a Mercado bottom sheet. Deliberately NOT a copy of the platform's own
 * login/consent page, and never a username/password field.
 */
export function ConsentSheet({
  open,
  platform,
  app = "Mercado",
  scopes,
  onAllow,
  onCancel,
  busy,
}: {
  open: boolean;
  platform?: BrandId;
  app?: string;
  scopes: { es: string; en: string }[];
  onAllow: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const name = platform ? BRANDS[platform].name : "";
  return (
    <BottomSheet open={open} onClose={onCancel} dismissable={!busy}>
      <div className="grid gap-5 px-6">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {platform && <BrandTile id={platform} size={48} />}
            <span aria-hidden className="text-[var(--m-on-surface-variant)]">⇄</span>
            <span className="grid size-12 place-items-center rounded-[12px] bg-[var(--m-accent)] text-[18px] font-semibold text-[var(--m-on-accent)]">M</span>
          </span>
          <DemoBadge>Demo: consentimiento simulado</DemoBadge>
        </div>
        <div>
          <h3 className="text-[22px] leading-tight">
            {app} quiere acceder a tu cuenta de {name}
          </h3>
          <p className="mt-1 text-[14px] text-[var(--m-on-surface-variant)]">
            {app} wants to read your {name} account. Simulated hand-off: nothing is read from a real account.
          </p>
        </div>
        <ul className="grid gap-3">
          {scopes.map((s) => (
            <li key={s.es} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--m-accent-container)] text-[var(--m-on-accent-container)]">
                <ShieldCheck className="size-5" strokeWidth={1.75} />
              </span>
              <span>
                <span className="block text-[16px]">{s.es}</span>
                <span className="block text-[13px] text-[var(--m-on-surface-variant)]">{s.en}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="flex items-start gap-2 text-[13px] leading-[1.4] text-[var(--m-on-surface-variant)]">
          <Lock className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          Nunca te pedimos tu contraseña · We never ask for your password. Sin afiliación con {name} · Not affiliated with {name}.
        </p>
        <div className="grid gap-2">
          <Button onClick={onAllow} loading={busy} disabled={busy}>
            Permitir · Allow
          </Button>
          <Button variant="text" onClick={onCancel} disabled={busy}>
            Cancelar · Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
