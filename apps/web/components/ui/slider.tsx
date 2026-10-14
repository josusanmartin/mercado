"use client";
import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Slider({ className, defaultValue, value, min = 0, max = 100, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn("relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50", className)}
      {...props}
    >
      <SliderPrimitive.Track data-slot="slider-track" className="bg-muted relative h-1.5 w-full grow overflow-hidden rounded-full">
        <SliderPrimitive.Range data-slot="slider-range" className="bg-primary absolute h-full" />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="border-primary bg-background block size-5 shrink-0 rounded-full border-2 shadow-sm transition-[color,box-shadow]"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
