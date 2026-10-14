// GET /api/contracts/verified?addresses=0x…,0x… → { [address]: "exact_match" | "match" | null }
// Sourcify verification status for the /contracts page, fetched SERVER-side (CR-08 rule: the browser makes no
// third-party calls) with a small concurrency gate, 429 backoff and a cache: exact matches are immutable for a
// deployed address, so they are kept for an hour; anything else is re-checked after 2 minutes.
import { isAddress } from "viem";
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";

const SOURCIFY = (a: string) => `https://contracts.tempo.xyz/v2/contract/${TEMPO_MODERATO_CHAIN_ID}/${a}`;
const MAX = 64;
type Match = string | null;
const cache = new Map<string, { match: Match; exp: number }>();
const pending = new Map<string, Promise<Match>>();

let active = 0;
const queue: (() => void)[] = [];
async function gate<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

async function check(address: string): Promise<Match> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await gate(() => fetch(SOURCIFY(address), { cache: "no-store" })).catch(() => undefined);
    if (r?.ok) {
      const j = (await r.json()) as { match?: string; runtimeMatch?: string };
      return j.match === "exact_match" && j.runtimeMatch === "exact_match" ? "exact_match" : (j.match ?? null);
    }
    if (r && r.status === 404) return null; // not verified
    await new Promise((res) => setTimeout(res, 300 * 2 ** attempt + Math.random() * 150));
  }
  throw new Error("Sourcify unavailable");
}

async function status(address: string): Promise<Match | undefined> {
  const hit = cache.get(address);
  if (hit && hit.exp > Date.now()) return hit.match;
  let p = pending.get(address);
  if (!p) {
    p = check(address);
    pending.set(address, p);
    p.finally(() => pending.delete(address));
  }
  try {
    const match = await p;
    cache.set(address, { match, exp: Date.now() + (match === "exact_match" ? 60 * 60_000 : 2 * 60_000) });
    return match;
  } catch {
    return hit?.match; // last known value, or unknown
  }
}

export async function GET(req: Request) {
  const list = (new URL(req.url).searchParams.get("addresses") ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => isAddress(a));
  const addresses = [...new Set(list)].slice(0, MAX);
  const entries = await Promise.all(addresses.map(async (a) => [a, await status(a)] as const));
  // unknown (Sourcify down and nothing cached) is omitted, so the page keeps showing "checking…"
  const out = Object.fromEntries(entries.filter(([, m]) => m !== undefined));
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
