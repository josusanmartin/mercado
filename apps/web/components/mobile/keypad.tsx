"use client";
// Android-style amount keypad: 56dp keys, circular ripple, haptic tick, long-press ⌫ clears.
// Value is a decimal string with at most 2 decimals and 7 digits.
import { useRef } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pressable } from "./primitives";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

export function nextAmount(value: string, k: string): string {
  if (k === "del") return value.slice(0, -1);
  if (k === "." && value.includes(".")) return value;
  if (value.includes(".") && value.split(".")[1].length >= 2) return value;
  if (value === "0" && k !== ".") return k;
  if (value.replace(".", "").length >= 7) return value;
  return (value === "" && k === "." ? "0" : value) + k;
}

export function NumericKeypad({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <div className={cn("grid grid-cols-3 gap-x-2 gap-y-1", className)}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          disabled={disabled}
          centeredRipple
          onClick={() => onChange(nextAmount(value, k))}
          onPointerDown={() => {
            if (k === "del") hold.current = setTimeout(() => onChange(""), 550);
          }}
          onPointerUp={() => clearTimeout(hold.current)}
          onPointerLeave={() => clearTimeout(hold.current)}
          aria-label={k === "del" ? "Borrar · Delete" : k === "." ? "Punto decimal" : k}
          className="m-num grid h-14 place-items-center rounded-full text-[26px] font-normal text-[var(--m-on-surface)] disabled:opacity-35"
        >
          {k === "del" ? <Delete className="size-6" strokeWidth={1.75} /> : k}
        </Pressable>
      ))}
    </div>
  );
}
