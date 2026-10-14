// Server-only persistence for POST /api/onramp (node:fs; never import from client code).
//
// Review follow-up to R-046/R-047:
//   1. FAIL CLOSED: a missing ledger is empty, but an existing ledger that is unreadable or malformed
//      throws LedgerUnavailable. It is never treated as empty, because that would forget signed or
//      delivered top-ups and could sign a second transfer for the same key.
//   2. SINGLE WRITER across processes: every read-modify-write runs inside an OS-level lock file created
//      with O_EXCL ("wx") holding {pid, token, at}. A held lock is reclaimed only when its owner pid is
//      gone (same host), or when it is unreadable and older than a few seconds (crash between create and
//      write). A live owner is never preempted, however long it holds the lock; waiters fail closed.
import { closeSync, existsSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Hex } from "viem";

export type OnrampStatus = "signed" | "delivered" | "failed";
export type OnrampIntent = {
  key: string;
  to: string;
  cents: number;
  day: string;
  status: OnrampStatus;
  hash?: Hex;
  signed?: Hex;
  createdAt: string;
  error?: string;
};
export type OnrampLedger = Record<string, OnrampIntent>;

export class LedgerUnavailable extends Error {}

const HEX = /^0x[0-9a-fA-F]+$/;
function validIntent(key: string, v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const i = v as Partial<OnrampIntent>;
  if (i.key !== key || typeof i.to !== "string" || typeof i.day !== "string") return false;
  if (typeof i.cents !== "number" || !Number.isInteger(i.cents) || i.cents <= 0) return false;
  if (i.status !== "signed" && i.status !== "delivered" && i.status !== "failed") return false;
  // A pending record must carry the exact bytes it reconciles by; without them a retry can't settle it.
  if (i.status === "signed" && !(typeof i.hash === "string" && HEX.test(i.hash) && typeof i.signed === "string" && HEX.test(i.signed))) return false;
  return true;
}

/** Missing file → {}. Present but unreadable, not JSON, or any malformed entry → LedgerUnavailable. */
export function loadLedger(file: string): OnrampLedger {
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new LedgerUnavailable(`on-ramp ledger unreadable: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new LedgerUnavailable("on-ramp ledger is not an object");
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>))
    if (!validIntent(k, v)) throw new LedgerUnavailable(`on-ramp ledger entry ${JSON.stringify(k)} is malformed`);
  return parsed as OnrampLedger;
}

/** Atomic replace: write a sibling temp file, then rename over the ledger. */
export function saveLedger(file: string, ledger: OnrampLedger) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(ledger, null, 1));
  renameSync(tmp, file);
}

type Held = { pid: number; token: string; at: number };
const UNREADABLE_GRACE_MS = 5_000;

function pidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"; // exists, owned by someone else
  }
}
function readHeld(lock: string): Held | null {
  try {
    const h = JSON.parse(readFileSync(lock, "utf8")) as Held;
    return Number.isInteger(h.pid) && typeof h.token === "string" ? h : null;
  } catch {
    return null;
  }
}

/**
 * Reclaim a stale lock without stealing a fresh one: move it aside under a unique name, check it is the
 * same lock we judged stale, and put it back (link fails if the name is taken) if it was not.
 */
function reclaim(lock: string, judged: Held | null) {
  const aside = `${lock}.reclaim.${process.pid}.${randomBytes(4).toString("hex")}`;
  try {
    renameSync(lock, aside);
  } catch {
    return; // someone else already moved it
  }
  const moved = readHeld(aside);
  if (judged && moved?.token !== judged.token) {
    try {
      linkSync(aside, lock);
    } catch {}
  }
  try {
    unlinkSync(aside);
  } catch {}
}

export async function withFileLock<T>(file: string, fn: () => Promise<T>, opts: { waitMs?: number; pollMs?: number } = {}): Promise<T> {
  const lock = `${file}.lock`;
  const token = randomBytes(12).toString("hex");
  mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + (opts.waitMs ?? 60_000);
  for (;;) {
    try {
      const fd = openSync(lock, "wx");
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, token, at: Date.now() } satisfies Held));
      } finally {
        closeSync(fd);
      }
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const held = readHeld(lock);
      if (held) {
        if (!pidAlive(held.pid)) reclaim(lock, held);
      } else {
        let age = 0;
        try {
          age = Date.now() - statSync(lock).mtimeMs;
        } catch {}
        if (age > UNREADABLE_GRACE_MS) reclaim(lock, null);
      }
      if (Date.now() > deadline) throw new LedgerUnavailable("on-ramp ledger is locked by another process");
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 200));
    }
  }
  try {
    return await fn();
  } finally {
    // Release only our own lock.
    if (readHeld(lock)?.token === token) {
      try {
        unlinkSync(lock);
      } catch {}
    }
  }
}
