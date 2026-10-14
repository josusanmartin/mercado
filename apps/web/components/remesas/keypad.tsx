"use client";
// Big amount keypad for the phone UI. Value is a decimal string with at most 2 decimals.
import { Delete } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

export function Keypad({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  function press(k: string) {
    if (k === "del") return onChange(value.slice(0, -1));
    if (k === "." && value.includes(".")) return;
    if (value.includes(".") && value.split(".")[1].length >= 2) return;
    if (value === "0" && k !== ".") return onChange(k);
    if (value.replace(".", "").length >= 7) return;
    onChange((value === "" && k === "." ? "0" : value) + k);
  }
  return (
    <div className="grid grid-cols-3 gap-1">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          onClick={() => press(k)}
          aria-label={k === "del" ? "Borrar / Delete" : k}
          className="grid h-12 place-items-center rounded-[10px] text-xl font-medium tabular hover:bg-[#f1e8da] active:bg-[#e7dccb] disabled:opacity-40"
        >
          {k === "del" ? <Delete className="size-5" /> : k}
        </button>
      ))}
    </div>
  );
}
