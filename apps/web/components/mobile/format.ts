// es-MX money formatting and a light haptic tick for the phone UI.
import { fromUnits } from "@/lib/format";

const mx = (d: number) => new Intl.NumberFormat("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });

/** 1234567890n (6dp) or 1234.5 → "$1,234.57" */
export function fmtMoney(value: bigint | number | undefined, digits = 2): string {
  if (value === undefined) return "—";
  const n = typeof value === "bigint" ? fromUnits(value) : value;
  if (!Number.isFinite(n)) return "—";
  return `${n < 0 ? "-" : ""}$${mx(digits).format(Math.abs(n))}`;
}

/** Keypad string → display ("1234.5" → "1,234.5"), keeping a trailing "." while typing. */
export function fmtTyping(v: string): string {
  if (!v) return "0";
  const [i, d] = v.split(".");
  const int = mx(0).format(Number(i || "0"));
  return d === undefined ? int : `${int}.${d}`;
}

/** Initials for avatar circles: "Mamá · Guadalajara" → "M", "Tienda Doña Mary" → "TD". */
export function initials(name: string): string {
  const words = name.split(/[\s·(]+/).filter((w) => /^[A-Za-zÀ-ÿ]/.test(w));
  return ((words[0]?.[0] ?? "") + (words.length > 1 && words[1].length > 2 ? words[1][0] : "")).toUpperCase();
}

/** Short vibration on Android Chrome; silently nothing elsewhere. */
export function haptic(ms = 8) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    /* not allowed (no user gesture / iframe) */
  }
}

/** "hace 5 min" style relative time in Spanish. */
export function haceTiempo(unixSeconds: number, now: number): string {
  const d = Math.max(0, Math.round(now - unixSeconds));
  if (d < 45) return "ahora";
  if (d < 3600) return `hace ${Math.max(1, Math.round(d / 60))} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  const days = Math.floor(d / 86400);
  return days === 1 ? "ayer" : `hace ${days} días`;
}
