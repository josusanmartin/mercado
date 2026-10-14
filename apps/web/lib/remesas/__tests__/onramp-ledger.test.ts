// On-ramp ledger review follow-up: fail closed on a corrupt ledger; single writer across processes.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LedgerUnavailable, loadLedger, saveLedger, withFileLock, type OnrampLedger } from "../onramp-ledger";

const dir = () => mkdtempSync(path.join(tmpdir(), "onramp-"));
const entry = { key: "k1234567", to: "0xabc", cents: 125, day: "2026-10-14", status: "delivered" as const, hash: "0x01" as const, createdAt: "x" };

describe("loadLedger fails closed", () => {
  it("missing file is an empty ledger", () => {
    expect(loadLedger(path.join(dir(), "none.json"))).toEqual({});
  });
  it("round-trips a valid ledger", () => {
    const f = path.join(dir(), "l.json");
    saveLedger(f, { [entry.key]: entry });
    expect(loadLedger(f)).toEqual({ [entry.key]: entry });
  });
  it.each([
    ["truncated JSON", '{"k1234567": {"key"'],
    ["empty file", ""],
    ["array", "[]"],
    ["null", "null"],
    ["entry key mismatch", JSON.stringify({ other: entry })],
    ["bad status", JSON.stringify({ [entry.key]: { ...entry, status: "maybe" } })],
    ["fractional cents", JSON.stringify({ [entry.key]: { ...entry, cents: 1.5 } })],
    ["pending without signed bytes", JSON.stringify({ [entry.key]: { ...entry, status: "signed", signed: undefined } })],
  ])("%s → LedgerUnavailable, never {}", (_, content) => {
    const f = path.join(dir(), "l.json");
    writeFileSync(f, content);
    expect(() => loadLedger(f)).toThrow(LedgerUnavailable);
  });
});

describe("withFileLock", () => {
  it("serializes writers across processes (no lost updates)", async () => {
    const d = dir();
    const f = path.join(d, "counter.json");
    saveLedger(f, {} as OnrampLedger);
    const mod = path.resolve(__dirname, "../onramp-ledger.ts");
    // Each child does 15 slow read-modify-writes under the lock. Without it, interleaving loses updates.
    const child = (id: string) =>
      new Promise<number>((resolve) => {
        const code = `
          const { withFileLock, loadLedger, saveLedger } = await import(${JSON.stringify(mod)});
          for (let n = 0; n < 15; n++) {
            await withFileLock(${JSON.stringify(f)}, async () => {
              const l = loadLedger(${JSON.stringify(f)});
              const c = Object.keys(l).length;
              await new Promise((r) => setTimeout(r, 3));
              const key = "${id}-" + n + "-" + c;
              l[key] = { key, to: "0x0", cents: 1, day: "d", status: "delivered", createdAt: "x" };
              saveLedger(${JSON.stringify(f)}, l);
            }, { pollMs: 2 });
          }`;
        const p = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", code], { stdio: "inherit" });
        p.on("exit", (c) => resolve(c ?? 1));
      });
    const codes = await Promise.all([child("a"), child("b"), child("c")]);
    expect(codes).toEqual([0, 0, 0]);
    expect(Object.keys(loadLedger(f))).toHaveLength(45);
    expect(existsSync(`${f}.lock`)).toBe(false);
    expect(readdirSync(d).filter((n) => n.includes(".lock"))).toEqual([]); // no claim files left behind
  }, 30_000);

  it("never auto-reclaims a lock whose owner is gone: fails closed, lock left for the operator", async () => {
    const f = path.join(dir(), "l.json");
    writeFileSync(`${f}.lock`, JSON.stringify({ pid: 2 ** 22 + 12345, token: "dead", at: Date.now() }));
    let ran = false;
    await expect(withFileLock(f, async () => (ran = true), { waitMs: 2_000, pollMs: 10 })).rejects.toThrow(/stale/);
    expect(ran).toBe(false);
    expect(JSON.parse(readFileSync(`${f}.lock`, "utf8")).token).toBe("dead");
  });

  it("an unreadable lock is waited on, then fails closed (never reclaimed)", async () => {
    const f = path.join(dir(), "l.json");
    writeFileSync(`${f}.lock`, "");
    await expect(withFileLock(f, async () => "ran", { waitMs: 200, pollMs: 20 })).rejects.toThrow(LedgerUnavailable);
    expect(readFileSync(`${f}.lock`, "utf8")).toBe("");
  });

  it("never preempts a live owner: waiters fail closed", async () => {
    const f = path.join(dir(), "l.json");
    // Held by this (live) process with an ancient timestamp: age alone must not reclaim it.
    writeFileSync(`${f}.lock`, JSON.stringify({ pid: process.pid, token: "live", at: 0 }));
    await expect(withFileLock(f, async () => "ran", { waitMs: 300, pollMs: 20 })).rejects.toThrow(LedgerUnavailable);
    expect(JSON.parse(readFileSync(`${f}.lock`, "utf8")).token).toBe("live");
  });

  it("releases only its own lock, even if fn throws", async () => {
    const f = path.join(dir(), "l.json");
    await expect(withFileLock(f, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(existsSync(`${f}.lock`)).toBe(false);
  });
});
