// Server-only env access. Next.js only auto-loads apps/web/.env*, but the crew's testnet keys live in the
// repo-root .env.local, so we merge that file in (without overriding real process env) on first use.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let loaded = false;

/** Repo root: walk up from cwd until we find the workspace root package.json. */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg) && readFileSync(pkg, "utf8").includes('"workspaces"')) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function loadRootEnv() {
  if (loaded) return;
  loaded = true;
  const file = path.join(repoRoot(), ".env.local");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export function env(name: string): string | undefined {
  loadRootEnv();
  const v = process.env[name];
  return v === "" ? undefined : v;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing env ${name} (expected in repo-root .env.local)`);
  return v;
}
