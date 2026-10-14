// The Mercado ecosystem: one currency, four products (crew/DESIGN-ECOSYSTEM.md).
import { ArrowLeftRight, Coins, CreditCard, Globe2, HandCoins, LayoutGrid, PiggyBank, type LucideIcon } from "lucide-react";
import type { PersonaId } from "@/components/wallet/personas";

export type ProductId = "home" | "mint" | "remesas" | "global" | "credito" | "card" | "invest";

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
  /** Text color on a solid fill of `color` (ink on gold, white elsewhere). */
  onColor?: string;
  /** Editorial index number ("01") and one English line for the Home index (product NAMES stay brand names). */
  index: string;
  line: string;
  /** Demo-mode account for this product (Crédito picks per tab). */
  demo?: PersonaId;
};

export const PRODUCTS: Product[] = [
  {
    id: "home",
    index: "00",
    line: "One currency, six products",
    href: "/",
    name: "Mercado",
    short: "Mercado",
    purpose: "A peso economy on Tempo.",
    audience: "Everyone",
    icon: LayoutGrid,
    color: "var(--ink)",
  },
  {
    id: "mint",
    index: "01",
    line: "Institutions create xMXN",
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
    index: "02",
    line: "Remittances home",
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
    index: "03",
    line: "Cross-border payments",
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
    index: "04",
    line: "Advances for gig workers",
    href: "/credito",
    name: "Mercado Crédito",
    short: "Crédito",
    purpose: "Cash advances for gig workers, funded by lenders.",
    audience: "Drivers and lenders",
    icon: HandCoins,
    color: "var(--c-credito)",
    demo: "driver",
  },
  {
    id: "card",
    index: "05",
    line: "Spend xMXN",
    href: "/card",
    name: "Mercado Card",
    short: "Card",
    purpose: "Spend xMXN at the corner store with a virtual card.",
    audience: "Families and the shops they buy from",
    icon: CreditCard,
    color: "var(--c-card)",
    demo: "recipient",
  },
  {
    id: "invest",
    index: "06",
    line: "Save and earn",
    href: "/invest",
    name: "Mercado Invest",
    short: "Invest",
    purpose: "Save in pesos or dollars, or buy tokenized T-bills.",
    audience: "Savers",
    icon: PiggyBank,
    color: "var(--c-invest)",
    onColor: "#111418",
    demo: "saver",
  },
];

/** Old routes keep their product color until api's redirects land. */
const ALIASES: Record<string, ProductId> = { "/send": "remesas", "/pay": "remesas", "/credit": "credito", "/earn": "credito" };

export function productForPath(path: string): Product {
  const alias = Object.entries(ALIASES).find(([p]) => path === p || path.startsWith(p + "/"));
  if (alias) return PRODUCTS.find((p) => p.id === alias[1])!;
  return PRODUCTS.find((p) => p.id !== "home" && (path === p.href || path.startsWith(p.href + "/"))) ?? PRODUCTS[0];
}
