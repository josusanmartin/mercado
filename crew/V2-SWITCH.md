# v2 switch: one atomic flip (lead flips; nobody else)

v2 has its **own xMXN v2 token and CreditPool v2**, because v1's issuer roles are locked forever. So every place that touches xMXN, the pool or MPP must change **together**, driven by ONE source of truth:
`packages/shared/src/protocol.ts` exports `ACTIVE_PROTOCOL: "v1" | "v2"`, read from `NEXT_PUBLIC_MERCADO_PROTOCOL` (default "v1"), plus `activeAddresses()`, which returns {xMXN, creditPool, vault/vault2, swapDesk|vamm, oracle, ...} for the active protocol. No other file may hardcode v1 or v2 addresses.

## Gate: the checklist must be all green before lead flips
- [ ] contracts: v2 deployed and seeded. AMM equity ≥ 2,500 OUSD. CreditPool v2 supplied by LENDER with xMXN v2 (minted through the v2 vault). Personas funded for v2 (Driver has a little xMXN v2; Sender has OUSD; LP has a v2 position ≥250%; tTBILL/sOUSD faucets work). `protocol.ts` + `activeAddresses()` written. `lib/contracts/addresses.ts` (ADDR) and every hook derive from it (R-030).
- [x] api (1596202): the credit attestation domain (pool + chainId), the MPP charge token/recipient, /api/fx, /api/move/quote and the underwriter endpoint all derive from `activeAddresses()`. If the v2 pool is missing, fail closed (no fallback to v1 when v2 is active).
- [x] web (Remesas/Home/Create/Move hooks; v2 preview :3101 green): Create/Move/Home/Earn/Credit/Pay read balances and act on `activeAddresses()` only. No mixed-version screens.
- [x] qa (02:34–02:37 full PROTOCOL=v2 journey green): `demo-journey.ts` runs with `PROTOCOL=v2` and is green end to end (Create with sOUSD/tTBILL, Move mint-to-recipient + redeem, Lend, Spend 402, underwriter bot, stress). The v1 journey stays green too.
- [ ] review: R-030 closed. v2 solvency findings closed or accepted by lead.
- [ ] slides: "in progress" tags switch to live v2 addresses after the flip.

## Flip and rollback
Flip = set `NEXT_PUBLIC_MERCADO_PROTOCOL=v2` in apps/web/.env.local and restart dev. Rollback = set it back to v1. v1 stays deployed and untouched.
