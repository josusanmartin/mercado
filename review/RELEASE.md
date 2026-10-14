# Mercado release record

Generated 2026-10-14T07:19:11Z by `node scripts/release-notes.mjs` (read-only; re-run after any recapture or publish).

## Code

| | |
|---|---|
| Commit | `0c27aa4516ccc6459d7863752a145a2f58c3bcb0` |
| Subject | 0c27aa4 2026-10-14T07:18:48+00:00 deck v83: final v5 spend video (no demo labels in frame, 38s) |
| Working tree | 81 uncommitted paths (shared tree; not part of this commit) |
| Chain | Tempo Moderato 42431 · protocol v2 (addresses: README.md, verified on Sourcify) |
| Contracts | Ran 10 test suites in 139.54ms (876.26ms CPU time): 141 tests passed, 0 failed, 0 skipped (141 total tests) (`scripts/evidence/forge-test.txt`) |

## Deck

| | |
|---|---|
| Published version | v83 |
| Main flow (6) | cover → problem → system → spend-video → compounds → close |
| Appendix (14) | j1-mint, j2-send, p-global, j3-advance, p-card, p-invest, j4-bills, risk, architecture, xmxn, next, judge-qa, j5-agent, proof |

### Assets referenced by the slides (16)

sha256 is of the LOCAL file today. A file overwritten after its upload would not match its blob; every overwrite was announced in #mercado and re-uploaded by lead (new blob url).

| Slides | File | Blob | Bytes | Modified (UTC) | sha256 |
|---|---|---|---:|---|---|
| close, cover | `deck/assets/art-tile.png` | `bf5a660a…` | 1,566,792 | 2026-10-14 01:22 | `79c41feebdfdfa00e6f019c7d8df898c28100987edb1873d56f8a9854619d16a` |
| p-card, spend-video | `deck/assets/hero-spend-final-paid.png` | `a45488e2…` | 141,226 | 2026-10-14 07:15 | `cec2b15aec2704022d4dc1b82aca6b7285fee9acfcf9c5db14172992c0a16ff2` |
| p-card, spend-video | `deck/assets/hero-spend-final.mp4` | `f1712307…` | 2,346,242 | 2026-10-14 07:16 | `3b8608b8006290848d74ffe4bb3765983f2dac598d0b9fe4dc60413ff512153c` |
| architecture, compounds, j5-agent, next | `deck/assets/art-band-2.png` | `d054ca3e…` | 424,701 | 2026-10-14 01:22 | `bf91cdf4a4c3f637402aaa9438edac1929987cee5b17939a63bf93431ec550ed` |
| compounds | `deck/assets/v7/crop-mint-risk-en.png` | `31ee2b3e…` | 67,349 | 2026-10-14 07:07 | `5619433b6e02b95728cd5cad27ea5e8c1021a89d5623b6485813a2ce6862546b` |
| j1-mint, risk | `deck/assets/v7/panel-mint-risk.png` | `dab620ed…` | 63,736 | 2026-10-14 07:05 | `b9ed039871ba2dd10b728448718c04f7b5e87999c3017a0c00c23f2e0df7c2a3` |
| j2-send | `deck/assets/v7/phone-remesas-home.png` | `e41b564c…` | 142,712 | 2026-10-14 07:05 | `1e1402a95c1499413b0cd63ded454aaecc3b92464a166b0e2a118e3b5290f655` |
| j2-send | `deck/assets/v7/phone-remesas-quote.png` | `da0a9d84…` | 112,582 | 2026-10-14 07:05 | `bf237f22343957f9580565de6d55c7248d8a6ae48107742f1579fee3231a9f8b` |
| p-global | `deck/assets/v7/panel-global-pay.png` | `96b32bcd…` | 83,245 | 2026-10-14 07:05 | `a78027b98819ee779bb1b33aca0ce5c1a34b94100bfb0d627b6e3df3ec8921e9` |
| j3-advance | `deck/assets/v7/phone-credito-inicio.png` | `e378ed9a…` | 140,752 | 2026-10-14 07:05 | `1cb80329fc640872ffa3e81417d2a7dbc171b4cdd560509144c199041cd5b8d1` |
| j3-advance | `deck/assets/v7/phone-credito-adelanto.png` | `9d2029bf…` | 123,184 | 2026-10-14 07:05 | `f10f375404dd857120159151ea616881c28a944da2df3ddb2c6a335123ff909a` |
| p-card | `deck/assets/v7/phone-card-approve.png` | `808d7761…` | 117,485 | 2026-10-14 07:05 | `37642c528560f534cc018f837791d9b865e5a45ee5d911c3932a0d733fb43fd7` |
| p-invest | `deck/assets/v7/phone-invest.png` | `c8b7d461…` | 138,186 | 2026-10-14 07:05 | `13ab7f43c11bf5e72eee50cd2f64c178ced98332fde45dd6395bd1634a841fdb` |
| j4-bills, proof | `deck/assets/v7/panel-developers-402.png` | `1f399d92…` | 179,377 | 2026-10-14 07:05 | `bb6b9626e7175879d1e6878d71b89bc55af238a6eccc5186d3d4c53941df42b6` |
| judge-qa, xmxn | `deck/assets/art-band-1.png` | `43f886d7…` | 409,095 | 2026-10-14 01:22 | `8ffeed1b25ac5b97b6e4259cb1e915a7f4a5ccd6e54d4b4fe233d00e2d0b8ea5` |
| proof | `deck/assets/v7/panel-contracts-verified.png` | `001ca958…` | 94,123 | 2026-10-14 07:05 | `12a0f6a3a56fa180c2d6c6a5411a970197fbad511451c89f8c1afe4c9490645f` |

## Gates

- v5 UI gate (`node scripts/v5-check.mjs`):
- `review/qa-v5/final-fc79ed0/report.txt`: ✅ ALL PASS of 36
- `review/qa-v5/final-fc79ed0-nojs/report.txt`: ✅ ALL PASS of 9
- `review/qa-v5/final-fc79ed0-390/report.txt`: ✅ ALL PASS of 9
- Card proof (`node scripts/card-proof-loop.mjs`): see #mercado for the latest run (each run asserts the POS receipt AND exactly +1 on-chain charge).

## Preflight (`npx tsx scripts/preflight.ts`)

```
Mercado preflight · protocol v2 · http://localhost:3100 · 2026-10-14T07:19:07Z

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
✅ api               POST /api/rpc            block 39522673 in 0.3s                            eth_blockNumber (browser read path)  
✅ api               GET /api/mpp/challenge   402 challenge in 0.8s                             inner 402 + WWW-Authenticate         
✅ api               GET /api/fx              200 in 0.3s                                       200 + body                           
✅ api               GET /api/move/quote      200 in 0.8s                                       200 + body                           
✅ api               GET /api/sponsor         200 in 0.0s                                       200 + body                           
✅ api               GET /api/invest/rates    200 in 2.7s                                       200 + body                           
✅ api               GET /api/credit/loans    200 in 0.5s                                       200 + body                           
✅ api               GET /api/mpp/pricing     200 in 0.0s                                       200 + body                           
✅ api               GET /api/driver/demo     200 in 0.0s                                       200 + body                           
✅ oracle            FX age                   18.4092 MXN/USD, 2 min old                        < 15 min (stale at 60)               
✅ sponsor           fee balance (AlphaUSD)   999,999.98 (≤0.01/tx; hourly quota is in-memory)  ≥ 5 AlphaUSD                         
✅ exchange          coverage                 259.4% (mint floor 100%)                          ≥ 110%                               
✅ exchange          mint room                1,972,070 xMXN                                    ≥ 50,000                             
⚠️  exchange          redeem bucket left       984 OUSD                                          ≥ 1,000                              
✅ invest            T-bill desk              1,998.9 tTBILL · 20,110 OUSD                      ≥ 100 tTBILL + ≥ 1,000 OUSD          
✅ invest            stocks desk              1,997.01 mIDX · 20,300 OUSD                       ≥ 100 mIDX + ≥ 1,000 OUSD            
✅ credit            pool cash                12,070 xMXN                                       ≥ 1,500 xMXN (one advance)           
✅ invest            sOUSD assets             6,212.19                                          > 0                                  
✅ invest            sxMXN assets             101                                               > 0                                  
✅ Javier            advance owed             0 xMXN                                            0 (fresh Crédito beat)               
✅ Javier            xMXN balance             600                                               ≥ 150 (live card proof)              
✅ Javier            card allowance           1,500                                             ≥ 300 (each charge spends it)        
✅ Javier            card #3 (…5646)          active                                            active (the beat freezes it on stage)
✅ Javier            card available today     2,150 (2,850/5,000 spent, resets 06:00 UTC)       ≥ 150 (+ retries)                    
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
┌─────────┬────────────────────┬────────────────┬──────────────┬──────────────┬────────────────────────────────────────────┐
│ (index) │ persona            │ OUSD           │ xMXN v2      │ advance owed │ card                                       │
├─────────┼────────────────────┼────────────────┼──────────────┼──────────────┼────────────────────────────────────────────┤
│ 0       │ 'LP (Institución)' │ '976,940'      │ '735,229.46' │ '0'          │ '—'                                        │
│ 1       │ 'Sender (US)'      │ '999,418.89'   │ '103.36'     │ '0'          │ '#2 active 0/700 today, allow 0'           │
│ 2       │ 'Sender2'          │ '1,243'        │ '0'          │ '0'          │ '—'                                        │
│ 3       │ 'Familia (MX)'     │ '1,000,053.43' │ '5,911.38'   │ '0'          │ '#1 active 0/1,000 today, allow 2,000'     │
│ 4       │ 'Driver (Javier)'  │ '1,000,000'    │ '600'        │ '0'          │ '#3 active 2,850/5,000 today, allow 1,500' │
│ 5       │ 'Lender'           │ '993,679.99'   │ '0'          │ '0'          │ '—'                                        │
└─────────┴────────────────────┴────────────────┴──────────────┴──────────────┴────────────────────────────────────────────┘
pool v2  cash 12,070 xMXN
MoveAMM  reserve 3,935.86 OUSD · issued 27,929.88 xMXN · equity 2,500 · coverage 259.4% · bucket 0/983.96
oracle   18.4092 MXN/USD (admin-relayed; untouched by reset), 130s old, valid
```
