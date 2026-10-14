// Durable mppx AtomicStore backed by <repo>/.data/mppx-store.json, so charge replay markers survive
// dev-server restarts and are shared by every route bundle. Uses synchronous fs I/O so each operation
// is atomic within the (single) Node process.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Store } from "mppx/server";
import { dataFile } from "../server/env";

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? { __bigint: v.toString() } : v);
const reviver = (_: string, v: unknown) =>
  v && typeof v === "object" && "__bigint" in v ? BigInt((v as { __bigint: string }).__bigint) : v;

export function fileStore(
  file = process.env.MERCADO_MPPX_STORE_FILE ?? dataFile("mppx-store.json"),
) {
  const load = (): Record<string, string> => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
  const save = (data: Record<string, string>) => {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  };
  const enc = (v: unknown) => JSON.stringify(v, replacer);
  const dec = (s: string) => JSON.parse(s, reviver);

  return Store.from({
    async get(key: string) {
      const raw = load()[key];
      return raw === undefined ? null : dec(raw);
    },
    async put(key: string, value: unknown) {
      const d = load();
      d[key] = enc(value);
      save(d);
    },
    async delete(key: string) {
      const d = load();
      delete d[key];
      save(d);
    },
    async update(key: string, fn: (current: unknown) => { op: "noop" | "set" | "delete"; value?: unknown; result: unknown }) {
      const d = load();
      const change = fn(d[key] === undefined ? null : dec(d[key]));
      if (change.op === "set") d[key] = enc(change.value);
      if (change.op === "delete") delete d[key];
      if (change.op !== "noop") save(d);
      return change.result;
    },
    tryClaim(key: string, expires: number) {
      const d = load();
      const cur = d[key] === undefined ? null : dec(d[key]);
      const isMarker = cur && typeof cur === "object" && (cur as { type?: string }).type === "mppx:replay";
      if (cur !== null && (!isMarker || (cur as { expires: number }).expires > Date.now())) return false;
      d[key] = enc({ expires, type: "mppx:replay" });
      save(d);
      return true;
    },
  } as unknown as Store.AtomicStore);
}
