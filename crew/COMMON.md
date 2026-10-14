# Crew rules (all agents)

You're one of four Claude Code agents building **Mercado** in parallel, plus a coordinator (`lead`) and the human (`josu`). Repo: `/home/josu/dev/mercado` (shared working tree, no worktrees).

**Read first:** `SPEC.md` (the product brief, which is the source of truth) and `INTERFACES.md` (ABIs, API schemas, conventions, file ownership). Then read your own brief, `crew/<your-nick>.md`.

## The channel: #mercado
Your nick is in `$IRC_NICK`. A human watches the channel live, so write the way a teammate posts in Slack/IRC.
- Post: `bin/irc say "message"`. Read new messages: `bin/irc unread`. Recent history: `bin/irc tail 30`.
- Check `bin/irc unread` **when you start, after every commit or milestone, and before any long task**. Reply to `@<your-nick>` mentions promptly. Messages from `josu` (the human) and `lead` take priority.
- Keep posts **short and human-readable**: 1–3 lines of plain English saying what changed, where, and what you need. Point to file paths rather than dumping code, logs or JSON. Use `@nick` to address someone.
- Always post: when you start, when you discover facts others need (RPC URLs, addresses, API shapes), when you change an interface, when you're blocked, and when you finish a milestone.

## Working agreements
- **Work autonomously** through your entire brief. Don't stop to ask the human questions in the terminal. Post the question in #mercado, take the most reasonable assumption, note it, and keep going. When your brief is done, post a summary and ask `@lead` for more work, then keep checking the channel.
- **Ownership:** only edit files you own (see the table in INTERFACES.md). For changes elsewhere, ask the owner in the channel. Interface changes: announce in the channel *and* update INTERFACES.md in the same commit (small, surgical edits).
- **Git:** commit early and often, staging **only your own paths** (`git add <paths>`; never `git add -A` or `git add .`). Never run `reset`, `checkout -- .`, `stash`, `rebase`, `clean`, or `push`. If you hit `index.lock`, wait a few seconds and retry. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **npm:** npm workspaces only (pnpm is broken here). Wrap installs in the shared lock: `flock .npm.lock npm install -w apps/web <pkg>` (run from repo root). Announce new deps in the channel.
- **Dev server:** `web` owns the single Next.js dev server on http://localhost:3100, running in the tmux window `dev`. Others hit that server. Never run `next build` while it's running; use `npx tsc --noEmit -p apps/web` for type checks.
- **Secrets:** testnet throwaway keys are in root `.env.local` (gitignored). Never commit keys or print private keys in the channel.
- **Honesty labels (non-negotiable, from SPEC):** Collateral is Tempo's *testnet* OUSD from the faucet: no real value, not issuer-backed, not redeemable. Uber data is "Demo Uber Data". Bill fulfillment is "SIMULATED". The oracle is an admin mock feed. Never claim fiat redemption, real bill payment, a peg, yield guarantees or a validated credit model.
- Verify against reality: Tempo and mppx are new, so read the actual docs and installed package source (`node_modules/mppx`, Tempo GitHub) rather than guessing APIs. Share what you learn in the channel; others need it too.
