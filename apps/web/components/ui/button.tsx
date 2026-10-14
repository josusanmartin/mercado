import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-medium transition-[color,background-color,box-shadow,transform] duration-150 ease-out enabled:active:scale-[0.97] motion-reduce:enabled:active:scale-100 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
        secondary: "border border-line bg-transparent text-foreground hover:border-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        brand: "bg-product text-product-fg hover:opacity-90",
      },
      size: {
        default: "h-10 px-4 has-[>svg]:px-3.5",
        sm: "h-8 gap-1.5 px-3.5 text-sm has-[>svg]:px-3",
        lg: "h-12 px-6 text-base has-[>svg]:px-5",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

/**
 * V5-TASTE #8: authored states. Press scales to .97 (not when disabled, not under reduced motion). Pass
 * `pending` (true/false) to reserve a fixed 16px icon slot: the spinner swaps in without changing the
 * button's width; `icon` is what the slot shows when not pending.
 */
function Button({
  className,
  variant,
  size,
  asChild = false,
  pending,
  icon,
  children,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean; pending?: boolean; icon?: React.ReactNode }) {
  const Comp = asChild ? Slot.Root : "button";
  const slotted = !asChild && pending !== undefined;
  return (
    <Comp data-slot="button" aria-busy={pending || undefined} className={cn(buttonVariants({ variant, size, className }))} {...props}>
      {slotted && (
        <span aria-hidden className="inline-grid size-4 shrink-0 place-items-center">
          {pending ? <Loader2 className="size-4 animate-spin" /> : icon}
        </span>
      )}
      {children}
    </Comp>
  );
}

export { Button, buttonVariants };
