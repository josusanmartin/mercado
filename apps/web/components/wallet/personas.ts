// Demo accounts, one per product role (crew/DESIGN-ECOSYSTEM.md: roles, not faces).
// TESTNET DEMO KEYS ONLY: throwaway Tempo Moderato accounts exposed to the browser on purpose
// (apps/web/.env.local, NEXT_PUBLIC_DEMO_*) so Demo mode works in one click. No real value.
import type { Address, Hex } from "viem";

export type PersonaId = "lp" | "sender" | "recipient" | "driver" | "lender" | "merchant" | "saver" | "partner";

export type Persona = {
  id: PersonaId;
  /** Role name shown in the UI. */
  name: string;
  /** Which product uses it. */
  role: string;
  blurb: string;
  address?: Address;
  privateKey?: Hex;
};

// process.env.NEXT_PUBLIC_* must be referenced literally so Next inlines them.
export const PERSONAS: Persona[] = [
  {
    id: "lp",
    name: "Institución demo",
    role: "Mercado Mint",
    blurb: "Locks collateral and mints xMXN.",
    address: process.env.NEXT_PUBLIC_DEMO_LP_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_LP_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "sender",
    name: "Sender (US)",
    role: "Mercado Remesas",
    blurb: "Sends money home and pays the family's bills.",
    address: process.env.NEXT_PUBLIC_DEMO_SENDER_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_SENDER_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "recipient",
    name: "Familia (MX)",
    role: "Mercado Remesas",
    blurb: "Receives xMXN from the sender.",
    address: process.env.NEXT_PUBLIC_DEMO_RECIPIENT_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_RECIPIENT_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "merchant",
    name: "Business demo",
    role: "Mercado Global",
    blurb: "Pays suppliers across the border.",
    address: process.env.NEXT_PUBLIC_DEMO_MERCHANT_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_MERCHANT_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "driver",
    name: "Driver",
    role: "Mercado Crédito",
    blurb: "Gets an advance on Demo Uber Data and repays it.",
    address: process.env.NEXT_PUBLIC_DEMO_DRIVER_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_DRIVER_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "lender",
    name: "Lender",
    role: "Mercado Crédito",
    blurb: "Funds the advance pool with xMXN.",
    address: process.env.NEXT_PUBLIC_DEMO_LENDER_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_LENDER_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "saver",
    name: "Saver",
    role: "Mercado Invest",
    blurb: "Saves in pesos and dollars and buys demo T-bills.",
    address: process.env.NEXT_PUBLIC_DEMO_SAVER_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_SAVER_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "partner",
    name: "API partner (demo)",
    role: "Developers",
    blurb: "A third-party app that pays Mercado's APIs per call over HTTP 402.",
    address: process.env.NEXT_PUBLIC_DEMO_PARTNER_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_PARTNER_PRIVATE_KEY as Hex | undefined,
  },
];

export const personaById = (id: PersonaId) => PERSONAS.find((p) => p.id === id)!;

export const personaByAddress = (addr?: string) =>
  addr ? PERSONAS.find((p) => p.address?.toLowerCase() === addr.toLowerCase()) : undefined;

/** Remesas contacts: real configured testnet wallets (Mamá is the Familia (MX) demo account). */
export type Contact = { id: "mama" | "papa" | "ana"; name: string; city: string; address?: Address };
export const CONTACTS: Contact[] = [
  { id: "mama", name: "Mamá", city: "Guadalajara", address: process.env.NEXT_PUBLIC_DEMO_RECIPIENT_ADDRESS as Address | undefined },
  { id: "papa", name: "Papá", city: "Puebla", address: process.env.NEXT_PUBLIC_DEMO_PAPA_ADDRESS as Address | undefined },
  { id: "ana", name: "Ana", city: "CDMX", address: process.env.NEXT_PUBLIC_DEMO_ANA_ADDRESS as Address | undefined },
];
export const contactByAddress = (addr?: string) => (addr ? CONTACTS.find((c) => c.address?.toLowerCase() === addr.toLowerCase()) : undefined);
