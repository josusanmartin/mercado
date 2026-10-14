# Vercel deploy readiness (josu 19:20): the site goes on Twitter from a stable Vercel URL

Goal: `apps/web` deploys to Vercel as a production build. lead runs the deploy; do NOT run `vercel` yourself and never print/commit keys.

1. Server state in `.data/*` (mppx-store, paid-results, attestations, mpp-secret, onramp, orders, api-calls) — Vercel's FS is read-only except `/tmp` and instances don't share it. Make every store resolve to `/tmp/mercado/…` when `process.env.VERCEL` is set (keep the env overrides + local `.data` default). `mpp-secret` must come from env `MPP_SECRET` when set (instances must agree), falling back to the file locally.
2. `env.ts` loadRootEnv must not crash when repo-root `.env.local` is absent (Vercel injects process.env).
3. Anything else that reads repo files at runtime (fixtures, deployments json, contracts ABIs, packages/*) must be bundled: check `outputFileTracingRoot`/`outputFileTracingIncludes` in next.config so serverless functions include them. Next builds from the monorepo root (npm workspaces).
4. Remove the stale `tailnet-host.ts.net` / `tailnet-ip` entries from `allowedDevOrigins` (keep the wildcards).
5. Verify: `npm run build -w apps/web` passes; then `VERCEL=1 npx next start -p 3102` from apps/web with env vars exported from .env.local (in a subshell, never echoed) and hit /, /remesas, /api/fx, /api/sponsor (GET), /api/onramp (GET), /api/driver/score — all 200.
6. Write the exact list of env var NAMES the server needs (no values) into this file under "## Env vars", commit, then post `@lead VERCEL ready` in IRC.
