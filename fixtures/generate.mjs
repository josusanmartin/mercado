// Deterministic demo earnings per platform (seeded PRNG). DiDi = ride-hailing, Rappi = delivery.
// Usage: node fixtures/generate.mjs fixtures   (writes fixtures/{didi,rappi}/*.json; adds `platform` to uber/*)
import { readFileSync, writeFileSync } from "node:fs";
const root = process.argv[2];
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const r2 = (n) => Math.round(n * 100) / 100;
const END = Date.UTC(2026, 9, 5);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const LABEL = { uber: "Demo Uber Data", didi: "Demo DiDi Data", rappi: "Demo Rappi Data" };
const NAME = { uber: "Uber", didi: "DiDi", rappi: "Rappi" };
const FEE = { didi: 0.22, rappi: 0.18 };

function build({ platform, profile, seed, weeks, driver, activeFrom, base, jitter, hours, dropWeeks = [] }) {
  const rand = rng(seed); const rows = []; const payments = [];
  for (let i = 0; i < weeks; i++) {
    const start = END - (weeks - 1 - i) * 7 * 86400e3;
    const active = i >= activeFrom && !dropWeeks.includes(i);
    const f = active ? 1 + (rand() * 2 - 1) * jitter : 0;
    const trips = active ? Math.max(1, Math.round(base.trips * f)) : 0;
    const gross = active ? r2(trips * base.fare * (0.95 + rand() * 0.1)) : 0;
    const serviceFee = r2(gross * FEE[platform]);
    const net = r2(gross - serviceFee);
    const activeHours = active ? r2(hours * f * (0.95 + rand() * 0.1)) : 0;
    rows.push({ weekStart: iso(start), weekEnd: iso(start + 6 * 86400e3), trips, activeHours, grossMxn: gross, serviceFeeMxn: serviceFee, netMxn: net });
    if (net > 0) payments.push({ paymentId: `demo-${platform}-${profile}-${String(i + 1).padStart(2, "0")}`, type: "weekly_payout", paidAt: iso(start + 8 * 86400e3) + "T15:00:00Z", amountMxn: net, currency: "MXN", weekStart: iso(start) });
  }
  return { label: LABEL[platform], demo: true, platform,
    disclaimer: `Synthetic earnings generated for a testnet demo. Not real ${NAME[platform]} data and not obtained from ${NAME[platform]}.`,
    profile, driver: { ...driver, currency: "MXN", source: "demo-fixture" }, weeks: rows, payments };
}
const sets = [
  build({ platform: "didi", profile: "steady", seed: 101, weeks: 12, activeFrom: 0, base: { trips: 105, fare: 112 }, jitter: 0.08, hours: 44,
    driver: { driverId: "demo-didi-steady-001", firstName: "Javier", city: "Ciudad de México", vehicle: "Toyota Yaris 2020", rating: 4.91, activatedAt: "2023-11-06" } }),
  build({ platform: "didi", profile: "irregular", seed: 113, weeks: 10, activeFrom: 0, base: { trips: 70, fare: 106 }, jitter: 0.3, hours: 26,
    driver: { driverId: "demo-didi-irregular-002", firstName: "Karla", city: "Puebla", vehicle: "Hyundai Grand i10 2019", rating: 4.84, activatedAt: "2025-02-10" } }),
  build({ platform: "didi", profile: "new-driver", seed: 127, weeks: 8, activeFrom: 5, base: { trips: 64, fare: 108 }, jitter: 0.15, hours: 28,
    driver: { driverId: "demo-didi-new-003", firstName: "Iván", city: "Querétaro", vehicle: "Nissan March 2021", rating: 4.88, activatedAt: "2026-09-21" } }),
  build({ platform: "rappi", profile: "steady", seed: 201, weeks: 12, activeFrom: 0, base: { trips: 140, fare: 52 }, jitter: 0.09, hours: 48,
    driver: { driverId: "demo-rappi-steady-001", firstName: "Javier", city: "Ciudad de México", vehicle: "Motocicleta Italika 150", rating: 4.95, activatedAt: "2024-06-03" } }),
  build({ platform: "rappi", profile: "irregular", seed: 213, weeks: 10, activeFrom: 0, base: { trips: 100, fare: 50 }, jitter: 0.3, hours: 26,
    driver: { driverId: "demo-rappi-irregular-002", firstName: "Jorge", city: "Monterrey", vehicle: "Bicicleta", rating: 4.79, activatedAt: "2025-04-14" } }),
  build({ platform: "rappi", profile: "new-driver", seed: 227, weeks: 8, activeFrom: 5, base: { trips: 90, fare: 50 }, jitter: 0.15, hours: 26,
    driver: { driverId: "demo-rappi-new-003", firstName: "Sofía", city: "Mérida", vehicle: "Motocicleta Honda Navi", rating: 4.9, activatedAt: "2026-09-21" } }),
];
for (const s of sets) writeFileSync(`${root}/${s.platform}/${s.profile}.json`, JSON.stringify(s, null, 2) + "\n");
// Uber fixtures: add the platform field, numbers unchanged.
for (const p of ["steady", "irregular", "new-driver"]) {
  const f = `${root}/uber/${p}.json`; const j = JSON.parse(readFileSync(f, "utf8"));
  const out = { label: j.label, demo: j.demo, platform: "uber", ...j };
  writeFileSync(f, JSON.stringify(out, null, 2) + "\n");
}
for (const s of sets) { const n = s.weeks.map((w) => w.netMxn).sort((a, b) => a - b); const med = n.length % 2 ? n[(n.length - 1) / 2] : (n[n.length / 2 - 1] + n[n.length / 2]) / 2; console.log(s.platform, s.profile, "median", Math.round(med)); }
