// File-backed store for bill quotes and orders: <repo>/.data/orders.json (gitignored).
// All mutations go through withStore(), serialized by a process-wide mutex kept on globalThis (Next dev
// bundles each route separately, so a module-level lock would not be shared) and written atomically.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BillOrder, BillProviderId, OrderStatus } from "@mercado/shared";
import { repoRoot } from "../env";

export interface StoredQuote {
  quoteId: string;
  provider: BillProviderId;
  description: string;
  amountMxn: number;
  account: string;
  amount: string; // 6dp base units
  token: `0x${string}`;
  tokenSymbol: string;
  recipient: `0x${string}`;
  expiresAt: number;
  createdAt: string;
}

export type StoredOrder = BillOrder & { account: string; recipient: `0x${string}` };

export interface StoreData {
  version: 1;
  quotes: Record<string, StoredQuote>;
  orders: Record<string, StoredOrder>;
  /** idempotencyKey → orderId */
  idempotency: Record<string, string>;
  /** lowercased payment tx hash → orderId (a payment can settle exactly one order) */
  payments: Record<string, string>;
}

const empty = (): StoreData => ({ version: 1, quotes: {}, orders: {}, idempotency: {}, payments: {} });

export function storeFile(): string {
  return process.env.MERCADO_ORDERS_FILE ?? path.join(repoRoot(), ".data", "orders.json");
}

function read(): StoreData {
  const file = storeFile();
  if (!existsSync(file)) return empty();
  return { ...empty(), ...(JSON.parse(readFileSync(file, "utf8")) as StoreData) };
}

function write(data: StoreData) {
  const file = storeFile();
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}

const LOCK = Symbol.for("mercado.bills.store.lock");
type G = typeof globalThis & { [LOCK]?: Promise<unknown> };

/** Runs fn with exclusive access to the store; persists if fn returns without throwing. */
export async function withStore<T>(fn: (db: StoreData) => T | Promise<T>): Promise<T> {
  const g = globalThis as G;
  const prev = g[LOCK] ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  g[LOCK] = prev.then(() => next);
  await prev.catch(() => {});
  try {
    const db = read();
    const out = await fn(db);
    write(db);
    return out;
  } finally {
    release();
  }
}

export async function readStore<T>(fn: (db: StoreData) => T): Promise<T> {
  return fn(read());
}

export function transition(order: StoredOrder, status: OrderStatus, note?: string) {
  const at = new Date().toISOString();
  order.status = status;
  order.updatedAt = at;
  order.history.push({ status, at, ...(note ? { note } : {}) });
}

/** Public view of an order (drops the raw account identifier). */
export function publicOrder(o: StoredOrder): BillOrder {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { account, recipient, ...rest } = o;
  return rest;
}
