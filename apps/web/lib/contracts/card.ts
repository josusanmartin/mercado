"use client";
// Mercado Card hooks (v2 only; ADDR.card is the zero address in v1). Real on-chain card controls and settlement;
// only the card network/PAN is simulated ("Demo virtual card: not a Visa/Mastercard, Mercado demo merchants only").
//
// Flow (cardholder phone + merchant terminal):
//   const c = useCardActions();
//   await c.issueCard(toUnits("1000"));                       // holder, daily limit
//   await c.approveSpending(toUnits("2000"));                 // holder, xMXN allowance = a second cap
//   const tap = newTap({ cardId, merchant, amount, ref });     // terminal proposes the exact terms
//   const sig = await c.signTap(tap);                          // HOLDER signs (EIP-712, mandatory)
//   await c.charge(tap, sig);                                  // MERCHANT terminal submits → CardCharged
//   await c.refund(chargeId, amount);                          // merchant
import { keccak256, stringToHex, toHex, type Address, type Hex } from "viem";
import { useConfig, useConnection, useReadContract, useReadContracts } from "wagmi";
import { signTypedData } from "wagmi/actions";
import { mercadoCardAbi } from "@mercado/shared";
import { ADDR, CHAIN_ID, PROTOCOL } from "./addresses";
import { tokenAbi } from "./abis";
import { useTx } from "./tx";

export const CARD_ENABLED = PROTOCOL === "v2" && ADDR.card !== "0x0000000000000000000000000000000000000000";
export const CARD_LABEL = "Demo virtual card: not a Visa/Mastercard, works only at Mercado demo merchants";

const REFRESH = { refetchInterval: 10_000 } as const;
const ok = <T>(r: { status: string; result?: unknown } | undefined) => (r?.status === "success" ? (r.result as T) : undefined);

export type CardView = {
  cardId: bigint;
  holder: Address;
  issuedAt: number;
  frozen: boolean;
  dailyLimit: bigint;
  spentToday: bigint;
  availableToday: bigint;
  /** DEMO number tail (not a PAN): show as "5x•• •••• •••• 1234" with CARD_LABEL */
  last4: number;
  /** next 00:00 America/Mexico_City (unix s): "Límite diario · Daily limit: resets at midnight CDMX" */
  resetsAt: number;
};

export type Tap = {
  cardId: bigint;
  holder: Address;
  merchant: Address;
  amount: bigint;
  merchantRef: Hex;
  nonce: bigint;
  deadline: bigint;
};

/** Build tap terms: random single-use nonce, short deadline (default 120s), merchant reference as bytes32. */
export function newTap(p: { cardId: bigint; holder: Address; merchant: Address; amount: bigint; ref: string; ttlSeconds?: number }): Tap {
  const rand = crypto.getRandomValues(new Uint8Array(16));
  return {
    cardId: p.cardId,
    holder: p.holder,
    merchant: p.merchant,
    amount: p.amount,
    merchantRef: p.ref.startsWith("0x") && p.ref.length === 66 ? (p.ref as Hex) : stringToHex(p.ref.slice(0, 31), { size: 32 }),
    nonce: BigInt(keccak256(toHex(rand))) >> 128n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + (p.ttlSeconds ?? 120)),
  };
}

const TAP_TYPES = {
  Tap: [
    { name: "cardId", type: "uint256" },
    { name: "holder", type: "address" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "merchantRef", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** A holder's cards (default: connected wallet). */
export function useCards(holder?: Address) {
  const { address } = useConnection();
  const who = holder ?? address;
  const ids = useReadContract({
    address: ADDR.card,
    abi: mercadoCardAbi,
    functionName: "cardsOf",
    args: [who!],
    chainId: CHAIN_ID,
    query: { enabled: CARD_ENABLED && !!who, ...REFRESH },
  });
  const list = (ids.data ?? []) as readonly bigint[];
  const views = useReadContracts({
    contracts: list.map((id) => ({ address: ADDR.card, abi: mercadoCardAbi, functionName: "getCard", args: [id], chainId: CHAIN_ID }) as const),
    query: { enabled: list.length > 0, ...REFRESH },
  });
  const allowance = useReadContract({
    address: ADDR.xmxn,
    abi: tokenAbi,
    functionName: "allowance",
    args: [who!, ADDR.card],
    chainId: CHAIN_ID,
    query: { enabled: CARD_ENABLED && !!who, ...REFRESH },
  });
  const cards: CardView[] = list.flatMap((id, i) => {
    const v = ok<Omit<CardView, "cardId" | "issuedAt" | "last4" | "resetsAt"> & { issuedAt: bigint; last4: number; resetsAt: bigint }>(views.data?.[i]);
    return v ? [{ ...v, cardId: id, issuedAt: Number(v.issuedAt), last4: Number(v.last4), resetsAt: Number(v.resetsAt) }] : [];
  });
  return { ...views, isLoading: ids.isLoading || views.isLoading, cards, ids: list, allowance: allowance.data as bigint | undefined };
}

/** Card program stats + whether `merchant` is an allowlisted terminal. */
export function useCardStats(merchant?: Address) {
  const q = useReadContracts({
    contracts: [
      { address: ADDR.card, abi: mercadoCardAbi, functionName: "stats", chainId: CHAIN_ID },
      ...(merchant ? [{ address: ADDR.card, abi: mercadoCardAbi, functionName: "merchant", args: [merchant], chainId: CHAIN_ID } as const] : []),
    ] as never,
    query: { enabled: CARD_ENABLED, ...REFRESH },
  });
  const d = q.data as { status: string; result?: unknown }[] | undefined;
  const s = ok<readonly [bigint, bigint, bigint, bigint, bigint]>(d?.[0]);
  const m = merchant ? ok<readonly [boolean, string]>(d?.[1]) : undefined;
  return {
    ...q,
    cardsIssued: s?.[0],
    totalSpent: s?.[1],
    totalRefunded: s?.[2],
    merchants: s?.[3],
    charges: s?.[4],
    merchantActive: m?.[0],
    merchantName: m?.[1],
  };
}

/** Card writes. Each returns useTx()-style steps (with explorer links) via `tx`. */
export function useCardActions() {
  const config = useConfig();
  const tx = useTx();
  const card = (functionName: string, args: readonly unknown[]) => ({ address: ADDR.card, abi: mercadoCardAbi as never, functionName, args });
  return {
    tx,
    issueCard: (dailyLimit: bigint) => tx.run((t) => t.write(card("issueCard", [dailyLimit]), "Issue virtual card")),
    setDailyLimit: (cardId: bigint, dailyLimit: bigint) => tx.run((t) => t.write(card("setDailyLimit", [cardId, dailyLimit]), "Set daily limit")),
    setFrozen: (cardId: bigint, frozen: boolean) => tx.run((t) => t.write(card("setFrozen", [cardId, frozen]), frozen ? "Freeze card" : "Unfreeze card")),
    /** xMXN allowance to the card contract: the most the card can ever pull (a second cap on top of the daily limit). */
    approveSpending: (amount: bigint) =>
      tx.run((t) => t.write({ address: ADDR.xmxn, abi: tokenAbi as never, functionName: "approve", args: [ADDR.card, amount] }, "Allow card spending")),
    /** HOLDER signs the exact tap terms (EIP-712, domain MercadoCard v1 on this chain + card contract). */
    signTap: (tap: Tap) =>
      signTypedData(config, {
        account: tap.holder,
        domain: { name: "MercadoCard", version: "1", chainId: CHAIN_ID, verifyingContract: ADDR.card },
        types: TAP_TYPES,
        primaryType: "Tap",
        message: tap,
      }),
    /** MERCHANT terminal submits the holder-signed tap. */
    charge: (tap: Tap, sig: Hex) =>
      tx.run((t) => t.write(card("charge", [tap.cardId, tap.amount, tap.merchantRef, tap.nonce, tap.deadline, sig]), "Charge card")),
    /** Merchant refunds up to the charged amount (approves the card contract to pull the refund). */
    refund: (chargeId: bigint, amount: bigint) =>
      tx.run(async (t) => {
        await t.write({ address: ADDR.xmxn, abi: tokenAbi as never, functionName: "approve", args: [ADDR.card, amount] }, "Allow refund");
        await t.write(card("refund", [chargeId, amount]), "Refund");
      }),
  };
}
