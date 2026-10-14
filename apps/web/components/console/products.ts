// The Mercado ecosystem: one currency, four products (crew/DESIGN-ECOSYSTEM.md).
import { ArrowLeftRight, Coins, Globe2, HandCoins, LayoutGrid, type LucideIcon } from "lucide-react";
import type { PersonaId } from "@/components/wallet/personas";

export type ProductId = "home" | "mint" | "remesas" | "global" | "credito";

export type Product = {
  id: ProductId;
  href: string;
  name: string;
  short: string;
  purpose: string;
  audience: string;
  icon: LucideIcon;
  /** CSS color token for the product's signature color. */
  color: string;
  /** Demo-mode account for this product (Crédito picks per tab). */
  demo?: PersonaId;
};

export const PRODUCTS: Product[] = [
  {
    id: "home",
    href: "/",
    name: "Mercado",
    short: "Mercado",
    purpose: "A parallel financial system for emerging markets, on Tempo.",
    audience: "Everyone",
    icon: LayoutGrid,
    color: "var(--ink)",
  },
  {
    id: "mint",
    href: "/mint",
    name: "Mercado Mint",
    short: "Mint",
    purpose: "Institutions mint xMXN against collateral that keeps earning.",
    audience: "Institutions and sophisticated minters",
    icon: Coins,
    color: "var(--c-mint)",
    demo: "lp",
  },
  {
    id: "remesas",
    href: "/remesas",
    name: "Mercado Remesas",
    short: "Remesas",
    purpose: "Send money home and pay the family's bills, from your phone.",
    audience: "Senders in the US, families in Mexico",
    icon: ArrowLeftRight,
    color: "var(--c-remesas)",
    demo: "sender",
  },
  {
    id: "global",
    href: "/global",
    name: "Mercado Global",
    short: "Global",
    purpose: "Cross-border MXN↔USD payments for businesses, priced off the oracle.",
    audience: "Businesses and fintech partners",
    icon: Globe2,
    color: "var(--c-global)",
    demo: "merchant",
  },
  {
    id: "credito",
    href: "/credito",
    name: "Mercado Crédito",
    short: "Crédito",
    purpose: "Cash advances for gig workers, funded by lenders.",
    audience: "Drivers and lenders",
    icon: HandCoins,
    color: "var(--c-credito)",
    demo: "driver",
  },
];

/** Old routes keep their product color until api's redirects land. */
const ALIASES: Record<string, ProductId> = { "/send": "remesas", "/pay": "remesas", "/credit": "credito", "/earn": "credito" };

export function productForPath(path: string): Product {
  const alias = Object.entries(ALIASES).find(([p]) => path === p || path.startsWith(p + "/"));
  if (alias) return PRODUCTS.find((p) => p.id === alias[1])!;
  return PRODUCTS.find((p) => p.id !== "home" && (path === p.href || path.startsWith(p.href + "/"))) ?? PRODUCTS[0];
}
