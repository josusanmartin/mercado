// Demo Tour personas. TESTNET DEMO KEYS ONLY: throwaway Tempo Moderato accounts, exposed to the
// browser on purpose (apps/web/.env.local, NEXT_PUBLIC_DEMO_*) so the tour runs in one click.
// They hold faucet tokens with no real value. Never reuse these keys anywhere else.
import type { Address, Hex } from "viem";

export type PersonaId = "lp" | "sender" | "recipient" | "driver" | "lender";

export type Persona = {
  id: PersonaId;
  name: string;
  role: string;
  blurb: string;
  address?: Address;
  privateKey?: Hex;
};

// process.env.NEXT_PUBLIC_* must be referenced literally so Next inlines them.
export const PERSONAS: Persona[] = [
  {
    id: "lp",
    name: "Lucía",
    role: "Liquidity provider",
    blurb: "Locks OUSD in the vault and mints xMXN.",
    address: process.env.NEXT_PUBLIC_DEMO_LP_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_LP_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "sender",
    name: "Miguel",
    role: "Sender in Houston",
    blurb: "Swaps OUSD for xMXN and sends it home.",
    address: process.env.NEXT_PUBLIC_DEMO_SENDER_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_SENDER_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "recipient",
    name: "Rosa",
    role: "Recipient in Puebla",
    blurb: "Receives xMXN from Miguel.",
    address: process.env.NEXT_PUBLIC_DEMO_RECIPIENT_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_RECIPIENT_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "driver",
    name: "Javier",
    role: "Driver in CDMX",
    blurb: "Gets an advance on Demo Uber Data and pays his phone bill.",
    address: process.env.NEXT_PUBLIC_DEMO_DRIVER_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_DRIVER_PRIVATE_KEY as Hex | undefined,
  },
  {
    id: "lender",
    name: "Elena",
    role: "Lender",
    blurb: "Funds the advance pool with xMXN.",
    address: process.env.NEXT_PUBLIC_DEMO_LENDER_ADDRESS as Address | undefined,
    privateKey: process.env.NEXT_PUBLIC_DEMO_LENDER_PRIVATE_KEY as Hex | undefined,
  },
];

export const personaById = (id: PersonaId) => PERSONAS.find((p) => p.id === id)!;

export const personaByAddress = (addr?: string) =>
  addr ? PERSONAS.find((p) => p.address?.toLowerCase() === addr.toLowerCase()) : undefined;
