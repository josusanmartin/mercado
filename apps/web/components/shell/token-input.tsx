"use client";
import { useId } from "react";
import { fmtAmount, toUnits } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Decimal amount input for a 6dp token, with balance/max hint. Value is the raw string. */
export function TokenInput({
  label,
  symbol,
  value,
  onChange,
  max,
  maxLabel = "Max",
  hint,
  disabled,
  invalid,
}: {
  label: string;
  symbol: string;
  value: string;
  onChange: (v: string) => void;
  max?: bigint;
  maxLabel?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const id = useId();
  const over = max !== undefined && toUnits(value) > max;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {max !== undefined && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(fmtAmount(max, 6).replace(/,/g, "").replace(/\.?0+$/, ""))}
            className="text-muted-foreground hover:text-primary text-xs tabular disabled:opacity-50"
          >
            {maxLabel}: {fmtAmount(max)}
          </button>
        )}
      </div>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          disabled={disabled}
          aria-invalid={invalid || over || undefined}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
          className={cn("h-11 pr-16 text-lg font-medium")}
        />
        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium">
          {symbol}
        </span>
      </div>
      {(hint || over) && (
        <p className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
          {over ? `More than the ${maxLabel.toLowerCase()} of ${fmtAmount(max)} ${symbol}.` : hint}
        </p>
      )}
    </div>
  );
}
