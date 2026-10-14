# Mercado release record

Generated 2026-10-14T10:27:26Z by `node scripts/release-notes.mjs` (read-only; re-run after any recapture or publish).

## Code

| | |
|---|---|
| Commit | `3c8f7f5ed5c70a275391240749a1b722862290d3` |
| Subject | 3c8f7f5 2026-10-14T10:26:45+00:00 deck v86: v6 spend video (stepper, score ring, pool bar) + stills |
| Working tree | 103 uncommitted paths (shared tree; not part of this commit) |
| Chain | Tempo Moderato 42431 · protocol v2 (addresses: README.md, verified on Sourcify) |
| Contracts | Ran 10 test suites in 139.54ms (876.26ms CPU time): 141 tests passed, 0 failed, 0 skipped (141 total tests) (`scripts/evidence/forge-test.txt`) |

## Deck

| | |
|---|---|
| Published version | v86 |
| Main flow (6) | cover → problem → system → spend-video → compounds → close |
| Appendix (14) | j1-mint, j2-send, p-global, j3-advance, p-card, p-invest, j4-bills, risk, architecture, xmxn, next, judge-qa, j5-agent, proof |

### Assets referenced by the slides (16)

sha256 is of the LOCAL file today. A file overwritten after its upload would not match its blob; every overwrite was announced in #mercado and re-uploaded by lead (new blob url).

| Slides | File | Blob | Bytes | Modified (UTC) | sha256 |
|---|---|---|---:|---|---|
| close, cover | `deck/assets/art-tile.png` | `bf5a660a…` | 1,566,792 | 2026-10-14 01:22 | `79c41feebdfdfa00e6f019c7d8df898c28100987edb1873d56f8a9854619d16a` |
| p-card, spend-video | `deck/assets/hero-spend-final-paid.png` | `ab4bcd1e…` | 140,407 | 2026-10-14 10:24 | `1857ff1fbd41bb5d29267e5c0e149bb82c75c69120a2dd50fd602fd1bfc28287` |
| p-card, spend-video | `deck/assets/hero-spend-final.mp4` | `74ea93eb…` | 2,464,847 | 2026-10-14 10:24 | `8f95f8f4185139ce38c19e4a7068f552ff39262a349e48684b98361b720820e7` |
| architecture, compounds, j5-agent, next | `deck/assets/art-band-2.png` | `d054ca3e…` | 424,701 | 2026-10-14 01:22 | `bf91cdf4a4c3f637402aaa9438edac1929987cee5b17939a63bf93431ec550ed` |
| compounds | `deck/assets/v7/crop-mint-risk-en.png` | `d42847db…` | 83,922 | 2026-10-14 10:23 | `4f54f9eb2f660d6552ddff85fd58e1b6880b74237beeab48674bb5fa946b79e2` |
| j1-mint, risk | `deck/assets/v7/panel-mint-risk.png` | `26281993…` | 78,276 | 2026-10-14 10:22 | `d9067e048b09a82f824670b0a858bb60b06a809154d249a8bc59ee74e9b7f1c3` |
| j2-send | `deck/assets/v7/phone-remesas-home.png` | `d8ad77e4…` | 141,523 | 2026-10-14 10:22 | `465e9149c75f251e333b4e83ffa6e946edaef77068eb90056ac690d086f5c4f4` |
| j2-send | `deck/assets/v7/phone-remesas-quote.png` | `c61f4123…` | 112,804 | 2026-10-14 10:22 | `bb24f2f7a0ebcd5ce8e7289b1a5a6ad3ebb0adeb6ebd38e26736a0e3cc07b76b` |
| p-global | `deck/assets/v7/panel-global-pay.png` | `2b4e343c…` | 83,926 | 2026-10-14 10:22 | `e1c3943562369fbcce37d8127b6d788fea83619e13db011424124da001434a4b` |
| j3-advance | `deck/assets/v7/phone-credito-inicio.png` | `0ad27c93…` | 137,823 | 2026-10-14 10:22 | `b340cf7a4f2faba470786f4cd8ad3000739bcd2e5145938c5b19c9bebeabba6c` |
| j3-advance | `deck/assets/v7/phone-credito-adelanto.png` | `68e9fbdc…` | 110,389 | 2026-10-14 10:22 | `1695dfcbdb96d85917f8747efa1bc4cd0fe43d656ccd10ac45b7b1b481ac1494` |
| p-card | `deck/assets/v7/phone-card-approve.png` | `ea6673da…` | 117,525 | 2026-10-14 10:22 | `587b9d32f95c269f860412e06d3713d06d4c93a1a38c2a2d2ba65a2707ffe661` |
| p-invest | `deck/assets/v7/phone-invest.png` | `ae8dc3c6…` | 134,650 | 2026-10-14 10:22 | `94abf015eb4ab4e7451794abec3d429b4f9e2bc41f82293d199800ee167a99df` |
| j4-bills, proof | `deck/assets/v7/panel-developers-402.png` | `521e7c84…` | 45,433 | 2026-10-14 10:22 | `71e384e5076b9ed0e9249b2a3cf999fb6d69ad6329e352802fd828444451df6a` |
| judge-qa, xmxn | `deck/assets/art-band-1.png` | `43f886d7…` | 409,095 | 2026-10-14 01:22 | `8ffeed1b25ac5b97b6e4259cb1e915a7f4a5ccd6e54d4b4fe233d00e2d0b8ea5` |
| proof | `deck/assets/v7/panel-contracts-verified.png` | `b1833d75…` | 110,168 | 2026-10-14 10:25 | `4c5a6a378a74061cc5a77b61090e83d35077721a5e291b509e318bf5c589847a` |

## Gates

- v5 UI gate (`node scripts/v5-check.mjs`):
- `review/qa-v5/final-fc79ed0/report.txt`: ✅ ALL PASS of 36
- `review/qa-v5/final-fc79ed0-nojs/report.txt`: ✅ ALL PASS of 9
- `review/qa-v5/final-fc79ed0-390/report.txt`: ✅ ALL PASS of 9
- Card proof (`node scripts/card-proof-loop.mjs`): see #mercado for the latest run (each run asserts the POS receipt AND exactly +1 on-chain charge).

## Preflight (`npx tsx scripts/preflight.ts`)

```
Mercado preflight · protocol v2 · http://localhost:3100 · 2026-10-14T10:27:21Z

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
✅ api               POST /api/rpc            block 39540908 in 0.3s                            eth_blockNumber (browser read path)  
✅ api               GET /api/mpp/challenge   402 challenge in 0.8s                             inner 402 + WWW-Authenticate         
✅ api               GET /api/fx              200 in 0.3s                                       200 + body                           
✅ api               GET /api/move/quote      200 in 0.8s                                       200 + body                           
✅ api               GET /api/sponsor         200 in 0.0s                                       200 + body                           
✅ api               GET /api/invest/rates    200 in 1.8s                                       200 + body                           
✅ api               GET /api/credit/loans    200 in 0.6s                                       200 + body                           
✅ api               GET /api/mpp/pricing     200 in 0.0s                                       200 + body                           
✅ api               GET /api/driver/demo     200 in 0.0s                                       200 + body                           
✅ oracle            FX age                   18.3662 MXN/USD, 9 min old                        < 15 min (stale at 60)               
✅ sponsor           fee balance (AlphaUSD)   999,999.98 (≤0.01/tx; hourly quota is in-memory)  ≥ 5 AlphaUSD                         
✅ exchange          coverage                 258.7% (mint floor 100%)                          ≥ 110%                               
✅ exchange          mint room                1,972,052 xMXN                                    ≥ 50,000                             
⚠️  exchange          redeem bucket left       984 OUSD                                          ≥ 1,000                              
✅ invest            T-bill desk              1,998.9 tTBILL · 20,110 OUSD                      ≥ 100 tTBILL + ≥ 1,000 OUSD          
✅ invest            stocks desk              1,997.01 mIDX · 20,300 OUSD                       ≥ 100 mIDX + ≥ 1,000 OUSD            
✅ credit            pool cash                12,085 xMXN                                       ≥ 1,500 xMXN (one advance)           
✅ invest            sOUSD assets             6,213.3                                           > 0                                  
✅ invest            sxMXN assets             101.01                                            > 0                                  
✅ Javier            advance owed             0 xMXN                                            0 (fresh Crédito beat)               
✅ Javier            xMXN balance             600                                               ≥ 150 (live card proof)              
✅ Javier            card allowance           950                                               ≥ 300 (each charge spends it)        
✅ Javier            card #3 (…5646)          active                                            active (the beat freezes it on stage)
✅ Javier            card available today     1,600 (3,400/5,000 spent, resets 06:00 UTC)       ≥ 150 (+ retries)                    
✅ Familia           card #1                  active · 1,000 available today                    active                               
✅ Sender (US)       OUSD balance             999,418.89                                        ≥ 500 (Remesas send)                 
✅ Sender (US)       own fee balance          1,000,000 AlphaUSD                                ≥ 0.1 (if the sponsor quota runs out)
✅ LP (Institución)  OUSD balance             976,940                                           ≥ 1,000 (Mint deposit)               
✅ LP (Institución)  own fee balance          999,999.99 AlphaUSD                               ≥ 0.1 (if the sponsor quota runs out)
✅ Saver             OUSD balance             999,376                                           ≥ 100 (Invest buy)                   
✅ Saver             own fee balance          1,000,000 AlphaUSD                                ≥ 0.1 (if the sponsor quota runs out)

✅ GO · 1 amber · 40 checks. Fix RED before going on stage (demo-reset, fund the persona, or ask the owner).
```

## Stage wallet states (`node packages/contracts/script/demo-state-v2.mjs`)

```
┌─────────┬────────────────────┬────────────────┬──────────────┬──────────────┬──────────────────────────────────────────┐
│ (index) │ persona            │ OUSD           │ xMXN v2      │ advance owed │ card                                     │
├─────────┼────────────────────┼────────────────┼──────────────┼──────────────┼──────────────────────────────────────────┤
│ 0       │ 'LP (Institución)' │ '976,940'      │ '734,664.46' │ '0'          │ '—'                                      │
│ 1       │ 'Sender (US)'      │ '999,418.89'   │ '103.36'     │ '0'          │ '#2 active 0/700 today, allow 0'         │
│ 2       │ 'Sender2'          │ '1,242'        │ '0'          │ '0'          │ '—'                                      │
│ 3       │ 'Familia (MX)'     │ '1,000,053.43' │ '5,929.72'   │ '0'          │ '#1 active 0/1,000 today, allow 2,000'   │
│ 4       │ 'Driver (Javier)'  │ '1,000,000'    │ '600'        │ '0'          │ '#3 active 3,400/5,000 today, allow 950' │
│ 5       │ 'Lender'           │ '993,679.99'   │ '0'          │ '0'          │ '—'                                      │
└─────────┴────────────────────┴────────────────┴──────────────┴──────────────┴──────────────────────────────────────────┘
pool v2  cash 12,085 xMXN
MoveAMM  reserve 3,936.86 OUSD · issued 27,948.21 xMXN · equity 2,500 · coverage 258.7% · bucket 0/984.21
oracle   18.3662 MXN/USD (admin-relayed; untouched by reset), 561s old, valid
```
