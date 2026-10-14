# Vercel deploy readiness (josu 19:20): the site goes on Twitter from a stable Vercel URL

Goal: `apps/web` deploys to Vercel as a production build. lead runs the deploy; do NOT run `vercel` yourself and never print/commit keys.

1. Server state in `.data/*` (mppx-store, paid-results, attestations, mpp-secret, onramp, orders, api-calls) — Vercel's FS is read-only except `/tmp` and instances don't share it. Make every store resolve to `/tmp/mercado/…` when `process.env.VERCEL` is set (keep the env overrides + local `.data` default). `mpp-secret` must come from env `MPP_SECRET` when set (instances must agree), falling back to the file locally.
2. `env.ts` loadRootEnv must not crash when repo-root `.env.local` is absent (Vercel injects process.env).
3. Anything else that reads repo files at runtime (fixtures, deployments json, contracts ABIs, packages/*) must be bundled: check `outputFileTracingRoot`/`outputFileTracingIncludes` in next.config so serverless functions include them. Next builds from the monorepo root (npm workspaces).
4. Remove the stale `tailnet-host.ts.net` / `tailnet-ip` entries from `allowedDevOrigins` (keep the wildcards).
5. Verify: `npm run build -w apps/web` passes; then `VERCEL=1 npx next start -p 3102` from apps/web with env vars exported from .env.local (in a subshell, never echoed) and hit /, /remesas, /api/fx, /api/sponsor (GET), /api/onramp (GET), /api/driver/score — all 200.
6. Write the exact list of env var NAMES the server needs (no values) into this file under "## Env vars", commit, then post `@lead VERCEL ready` in IRC.

## Env vars

Names only. Set them in the Vercel project (Production + Preview). Values: root `.env.local` (server) and `apps/web/.env.local` (client).

Server runtime (server-only; mark the keys Sensitive):
- `MPP_SECRET`: **required on Vercel**. Any 32-byte hex string; all instances must share it so 402 challenges verify. The older name `MPP_SECRET_KEY` still works; neither is in `.env.local` today, so generate a new one.
- `SPONSOR_PRIVATE_KEY`: `/api/sponsor` fee-payer relay
- `ATTESTATION_SIGNER_PRIVATE_KEY`: `/api/driver/score` attestations (CreditPool signer)
- `ONRAMP_ENABLED`, `ONRAMP_FLOAT_PRIVATE_KEY`: SIMULATED card on-ramp (OFF unless `ONRAMP_ENABLED` is set)
- Sponsor persona allow-list: `LP_ADDRESS`, `SENDER_ADDRESS`, `SENDER2_ADDRESS`, `RECIPIENT_ADDRESS`, `RECIPIENT_PAPA_ADDRESS`, `RECIPIENT_ANA_ADDRESS`, `DRIVER_ADDRESS`, `LENDER_ADDRESS`, `SAVER_ADDRESS`, `MERCHANT_ADDRESS`
- Optional: `TEMPO_RPC_URL` (defaults to the shared chain config), `MERCADO_PROTOCOL` (server fallback; `NEXT_PUBLIC_MERCADO_PROTOCOL` is read first), `MERCADO_DATA_DIR` (state dir; defaults to `/tmp/mercado` when `VERCEL` is set)

Client build-time (inlined into the bundle, so set them before the build; testnet demo keys only, exposed on purpose for the Demo Tour):
- `NEXT_PUBLIC_MERCADO_PROTOCOL`
- `NEXT_PUBLIC_DEMO_LP_PRIVATE_KEY`, `NEXT_PUBLIC_DEMO_LP_ADDRESS`
- `NEXT_PUBLIC_DEMO_SENDER_PRIVATE_KEY`, `NEXT_PUBLIC_DEMO_SENDER_ADDRESS`
- `NEXT_PUBLIC_DEMO_RECIPIENT_PRIVATE_KEY`, `NEXT_PUBLIC_DEMO_RECIPIENT_ADDRESS`
- `NEXT_PUBLIC_DEMO_DRIVER_PRIVATE_KEY`, `NEXT_PUBLIC_DEMO_DRIVER_ADDRESS`
- `NEXT_PUBLIC_DEMO_LENDER_PRIVATE_KEY`, `NEXT_PUBLIC_DEMO_LENDER_ADDRESS`
- `NEXT_PUBLIC_DEMO_MERCHANT_PRIVATE_KEY`, `NEXT_PUBLIC_DEMO_MERCHANT_ADDRESS`
- `NEXT_PUBLIC_DEMO_SAVER_PRIVATE_KEY`, `NEXT_PUBLIC_DEMO_SAVER_ADDRESS`
- `NEXT_PUBLIC_DEMO_PARTNER_PRIVATE_KEY`, `NEXT_PUBLIC_DEMO_PARTNER_ADDRESS`
- `NEXT_PUBLIC_DEMO_PAPA_ADDRESS`, `NEXT_PUBLIC_DEMO_ANA_ADDRESS`, `NEXT_PUBLIC_MERCHANT_ADDRESS`
- Optional: `NEXT_PUBLIC_CHAIN_ID` (default 42431), `NEXT_PUBLIC_FEE_SPONSOR` (`0` turns sponsorship off)

Vercel sets `VERCEL` itself. Do NOT set `MERCADO_NO_WARM` or `NEXT_DIST_DIR`; they are dev-only.

Project settings: Root Directory `apps/web`, framework Next.js, default install/build (`npm install` at the workspace root, `next build`). `next.config.ts` sets `outputFileTracingRoot` to the repo root and traces `package.json`, `fixtures/**/*.json` and `packages/contracts/cache/fx-relay.json`. That last file is gitignored, so a git deploy won't have it, and the FX label then omits the relay provenance. A root `.vercelignore` keeps `.env*`, `.data/`, `.irc/`, `review/`, `deck/` and the bulky contracts dirs out of a CLI upload.

Known limit: `/tmp` is per instance, so orders, paid results, replay markers, attestations and the API-call ledger are not shared across instances and reset on cold start. That's fine for a demo. Shared state would need a KV store.

Verified 2026-10-14 by api: `npm run build -w apps/web` passes (built into a separate distDir so :3100 was untouched). Ran `VERCEL=1 next start -p 3102` with env exported in a subshell: /, /remesas, /global, /developers, /credito, /invest, /api/fx, /api/sponsor, /api/onramp, /api/driver/demo, /api/mpp/pricing, /api/invest/rates and /api/mpp/challenge?product=move-quote all returned 200. POST /api/driver/score {borrower, profile} returned 200 (GET is 405 by design). A bills quote wrote to `/tmp/mercado/orders.json` and `.data` stayed untouched.

## Round 2 (lead 20:40): Twitter traffic on a Hobby plan
Deployed: https://mercado-lovat-eight.vercel.app (project josus-projects-42b794d2/mercado, Hobby). Measured locally: one idle landing tab = **72 POST /api/rpc in 30 s** (~2.4 req/s per visitor), and every one is a Vercel function invocation. Hobby pauses the project when monthly limits are hit, and my 16-page headless smoke test already tripped Vercel's automatic DDoS challenge (x-vercel-mitigated: challenge) for everyone.
1. Production browsers should read the chain without our function: add `NEXT_PUBLIC_RPC_DIRECT=1` → wagmi/viem transports go straight to the public Tempo Moderato RPC (http batch on, sensible retry/backoff), and keep /api/rpc as the default locally. Each visitor then uses its own IP's RPC budget. Check that the CR-08 reasons (what was it guarding against?) still hold for distributed visitors and note it.
2. Cut polling: no refetch while the tab is hidden (`refetchIntervalInBackground: false`, `refetchOnWindowFocus` sane), block-watch/poll intervals ≥ 4 s, and no duplicate queries for the same read (log what the 72 calls actually are first, then fix the top offenders).
3. Target: an idle landing tab ≤ 10 function invocations/min in production mode; measure before/after with `next start` locally (same method: count requests for 30 s) and post the numbers.
Commit, then `@lead VERCEL r2 ready`. Don't deploy; lead does.
