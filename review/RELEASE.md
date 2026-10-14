# Mercado release record

Generated 2026-10-14T07:02:05Z by `node scripts/release-notes.mjs` (read-only; re-run after any recapture or publish).

## Code

| | |
|---|---|
| Commit | `fc79ed090696a6b7726b6befb6ee2d5292c753ef` |
| Subject | fc79ed0 2026-10-14T06:54:27+00:00 Global Pay: stable 22rem min-width at sm+ (important over PanelActions' child min-w), so the button no longer resizes 192→334px when the quote arrives |
| Working tree | 80 uncommitted paths (shared tree; not part of this commit) |
| Chain | Tempo Moderato 42431 · protocol v2 (addresses: README.md, verified on Sourcify) |
| Contracts | Ran 10 test suites in 139.54ms (876.26ms CPU time): 141 tests passed, 0 failed, 0 skipped (141 total tests) (`scripts/evidence/forge-test.txt`) |

## Deck

| | |
|---|---|
| Published version | v76 (draft; slides recapturing) |
| Main flow (6) | cover → problem → system → spend-video → compounds → close |
| Appendix (14) | j1-mint, j2-send, p-global, j3-advance, p-card, p-invest, j4-bills, risk, architecture, xmxn, next, judge-qa, j5-agent, proof |

### Assets referenced by the slides (16)

sha256 is of the LOCAL file today. A file overwritten after its upload would not match its blob; every overwrite was announced in #mercado and re-uploaded by lead (new blob url).

| Slides | File | Blob | Bytes | Modified (UTC) | sha256 |
|---|---|---|---:|---|---|
| close, cover | `deck/assets/art-tile.png` | `bf5a660a…` | 1,566,792 | 2026-10-14 01:22 | `79c41feebdfdfa00e6f019c7d8df898c28100987edb1873d56f8a9854619d16a` |
| p-card, spend-video | `deck/assets/hero-spend-final-paid.png` | `799674cf…` | 147,391 | 2026-10-14 03:24 | `12f9a9ea20a6c658e8202c5b3d3373bf39f442585ed76cdc6983359eb5b84db0` |
| p-card, spend-video | `deck/assets/hero-spend-final.mp4` | `1445b775…` | 3,647,511 | 2026-10-14 03:25 | `36b4a09fb87da3ba5d3731eb9ede5490e716fec63401f9dad4ac4530dbd944de` |
| architecture, compounds, j5-agent, next | `deck/assets/art-band-2.png` | `d054ca3e…` | 424,701 | 2026-10-14 01:22 | `bf91cdf4a4c3f637402aaa9438edac1929987cee5b17939a63bf93431ec550ed` |
| compounds | `deck/assets/v7/crop-mint-risk-en.png` | `5a46901b…` | 47,149 | 2026-10-14 04:34 | `9b3204b2e56dcf8f1bc141b6396faeebb17e206a13d0c1c6b57115dcca0ef59a` |
| j1-mint, risk | `deck/assets/v7/panel-mint-risk.png` | `b05621de…` | 49,543 | 2026-10-14 04:21 | `17ec784226157e18aebf5c9dcd12f2b771eb4631a0b1c4775f9a6089bc755ae7` |
| j2-send | `deck/assets/v7/phone-remesas-home.png` | `9cd4ca56…` | 102,646 | 2026-10-14 04:26 | `0f0622b8802475ebb3f7c7e3ea504df2b092ec67db9271177ce3e9a8c742b09e` |
| j2-send | `deck/assets/v7/phone-remesas-quote.png` | `3cef45c4…` | 92,663 | 2026-10-14 04:26 | `6863ccba2c442e8f6c795e5a5f8462abb2929afc93eba24747fb0716a90ec0bf` |
| p-global | `deck/assets/v7/panel-global-quote.png` | `3698fcd4…` | 92,470 | 2026-10-14 04:25 | `ff1ad1320417387dfea49d33c8d7a23a3ec0575feb32814174261f838e3e56d9` |
| j3-advance | `deck/assets/v7/phone-credito-inicio.png` | `97a80469…` | 142,682 | 2026-10-14 03:57 | `3806fc7dec8384fb0dfd2a4f4284a09f346cdc9ab3ebdc92aaffd31edfaa3814` |
| j3-advance | `deck/assets/v7/phone-credito-adelanto.png` | `62da4b71…` | 140,342 | 2026-10-14 03:57 | `2f0e022bdbf1d0758f645f4e6fb14ca9f87bc3186d7f82ca6fb5f478914eb72f` |
| p-card | `deck/assets/v7/phone-card-approve.png` | `9d0dd250…` | 117,876 | 2026-10-14 04:42 | `6a4147485fd0c1b23e007324a0246b195150007257177d218fa0eeb7fa8e58dc` |
| p-invest | `deck/assets/v7/phone-invest.png` | `a0403273…` | 146,005 | 2026-10-14 03:58 | `563c4a15776f2928c644d50e02722f270f2fde2632fea71fc1a911d50b10031c` |
| j4-bills, proof | `deck/assets/v7/panel-developers-402.png` | `6b0a3d6a…` | 179,143 | 2026-10-14 04:22 | `92e2abd5bb5338eb8d86826d314fb589512daed95efd0a2a54b24f4668463483` |
| judge-qa, xmxn | `deck/assets/art-band-1.png` | `43f886d7…` | 409,095 | 2026-10-14 01:22 | `8ffeed1b25ac5b97b6e4259cb1e915a7f4a5ccd6e54d4b4fe233d00e2d0b8ea5` |
| proof | `deck/assets/v7/panel-contracts-verified.png` | `6038893f…` | 102,050 | 2026-10-14 04:22 | `0cd870a8a635ed8302512086a6cad4c61f6b0406029dc3752729bf687f817032` |

## Gates

- v5 UI gate (`node scripts/v5-check.mjs`):
- `review/qa-v5/final-fc79ed0/report.txt`: ✅ ALL PASS of 36
- `review/qa-v5/final-fc79ed0-nojs/report.txt`: ✅ ALL PASS of 9
- `review/qa-v5/final-fc79ed0-390/report.txt`: ✅ ALL PASS of 9
- Card proof (`node scripts/card-proof-loop.mjs`): see #mercado for the latest run (each run asserts the POS receipt AND exactly +1 on-chain charge).

## Preflight (`npx tsx scripts/preflight.ts`)

```
Mercado preflight · protocol v2 · http://localhost:3100 · 2026-10-14T07:01:59Z

   area              check                    value                                             need
✅ app :3100         GET /                    200 in 0.1s                                       200 < 10s                            
✅ app :3100         GET /mint                200 in 0.1s                                       200 < 10s                            
✅ app :3100         GET /remesas             200 in 0.1s                                       200 < 10s                            
✅ app :3100         GET /global              200 in 0.1s                                       200 < 10s                            
✅ app :3100         GET /credito?tab=driver  200 in 0.1s                                       200 < 10s                            
✅ app :3100         GET /card?holder=driver  200 in 0.1s                                       200 < 10s                            
✅ app :3100         GET /invest              200 in 0.1s                                       200 < 10s                            
✅ app :3100         GET /developers          200 in 0.1s                                       200 < 10s                            
✅ app :3100         GET /contracts           200 in 0.1s                                       200 < 10s                            
✅ api               POST /api/rpc            block 39520979 in 0.0s                            eth_blockNumber (browser read path)  
✅ api               GET /api/mpp/challenge   402 challenge in 0.8s                             inner 402 + WWW-Authenticate         
✅ api               GET /api/fx              200 in 0.3s                                       200 + body                           
✅ api               GET /api/move/quote      200 in 0.8s                                       200 + body                           
✅ api               GET /api/sponsor         200 in 0.0s                                       200 + body                           
✅ api               GET /api/invest/rates    200 in 1.6s                                       200 + body                           
✅ api               GET /api/credit/loans    200 in 0.6s                                       200 + body                           
✅ api               GET /api/mpp/pricing     200 in 0.0s                                       200 + body                           
✅ api               GET /api/driver/demo     200 in 0.0s                                       200 + body                           
✅ oracle            FX age                   18.3997 MXN/USD, 5 min old                        < 15 min (stale at 60)               
✅ sponsor           fee balance (AlphaUSD)   999,999.99 (≤0.01/tx; hourly quota is in-memory)  ≥ 5 AlphaUSD                         
✅ exchange          coverage                 259.3% (mint floor 100%)                          ≥ 110%                               
✅ exchange          mint room                1,972,070 xMXN                                    ≥ 50,000                             
⚠️  exchange          redeem bucket left       984 OUSD                                          ≥ 1,000                              
✅ invest            T-bill desk              1,998.9 tTBILL · 20,110 OUSD                      ≥ 100 tTBILL + ≥ 1,000 OUSD          
✅ invest            stocks desk              1,997.01 mIDX · 20,300 OUSD                       ≥ 100 mIDX + ≥ 1,000 OUSD            
✅ credit            pool cash                12,055 xMXN                                       ≥ 1,500 xMXN (one advance)           
✅ invest            sOUSD assets             6,212.18                                          > 0                                  
✅ invest            sxMXN assets             101                                               > 0                                  
✅ Javier            advance owed             0 xMXN                                            0 (fresh Crédito beat)               
✅ Javier            xMXN balance             600                                               ≥ 150 (live card proof)              
✅ Javier            card allowance           900                                               ≥ 300 (each charge spends it)        
✅ Javier            card #3 (…5646)          active                                            active (the beat freezes it on stage)
✅ Javier            card available today     2,450 (2,550/5,000 spent, resets 06:00 UTC)       ≥ 150 (+ retries)                    
✅ Familia           card #1                  active · 1,000 available today                    active                               
✅ Sender (US)       OUSD balance             999,418.89                                        ≥ 500 (Remesas send)                 
✅ Sender (US)       own fee balance          1,000,000 AlphaUSD                                ≥ 0.1 (if the sponsor quota runs out)
✅ LP (Institución)  OUSD balance             976,940                                           ≥ 1,000 (Mint deposit)               
✅ LP (Institución)  own fee balance          999,999.99 AlphaUSD                               ≥ 0.1 (if the sponsor quota runs out)
✅ Saver             OUSD balance             999,377                                           ≥ 100 (Invest buy)                   
✅ Saver             own fee balance          1,000,000 AlphaUSD                                ≥ 0.1 (if the sponsor quota runs out)

✅ GO · 1 amber · 40 checks. Fix RED before going on stage (demo-reset, fund the persona, or ask the owner).
```

## Stage wallet states (`node packages/contracts/script/demo-state-v2.mjs`)

```
┌─────────┬────────────────────┬────────────────┬──────────────┬──────────────┬──────────────────────────────────────────┐
│ (index) │ persona            │ OUSD           │ xMXN v2      │ advance owed │ card                                     │
├─────────┼────────────────────┼────────────────┼──────────────┼──────────────┼──────────────────────────────────────────┤
│ 0       │ 'LP (Institución)' │ '976,940'      │ '735,544.46' │ '0'          │ '—'                                      │
│ 1       │ 'Sender (US)'      │ '999,418.89'   │ '103.36'     │ '0'          │ '#2 active 0/700 today, allow 0'         │
│ 2       │ 'Sender2'          │ '1,243'        │ '0'          │ '0'          │ '—'                                      │
│ 3       │ 'Familia (MX)'     │ '1,000,053.43' │ '5,911.38'   │ '0'          │ '#1 active 0/1,000 today, allow 2,000'   │
│ 4       │ 'Driver (Javier)'  │ '1,000,000'    │ '600'        │ '0'          │ '#3 active 2,550/5,000 today, allow 900' │
│ 5       │ 'Lender'           │ '993,679.99'   │ '0'          │ '0'          │ '—'                                      │
└─────────┴────────────────────┴────────────────┴──────────────┴──────────────┴──────────────────────────────────────────┘
pool v2  cash 12,055 xMXN
MoveAMM  reserve 3,935.86 OUSD · issued 27,929.88 xMXN · equity 2,500 · coverage 259.3% · bucket 0/983.96
oracle   18.3997 MXN/USD (admin-relayed; untouched by reset), 312s old, valid
```
