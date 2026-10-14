// Keyed async mutex (per order). Kept on globalThis so every Next route bundle shares it.
const KEY = Symbol.for("mercado.bills.orderLocks");
type G = typeof globalThis & { [KEY]?: Map<string, Promise<void>> };

export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as G;
  const locks = (g[KEY] ??= new Map());
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const tail = prev.then(() => mine);
  locks.set(key, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}
