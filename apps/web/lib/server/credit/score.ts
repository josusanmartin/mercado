// Deterministic, illustrative credit heuristic. These are FAKE underwriting parameters for a testnet demo,
// not an empirically validated credit model.
import type { ScoreFeatures, WeeklyEarnings } from "@mercado/shared";

export const SCORE_VERSION = "mercado-demo-heuristic-v1";
export const SCORE_FLOOR = 50;
export const MIN_ACTIVE_WEEKS = 6;
export const MIN_MEDIAN_NET_MXN = 1500;
export const INCOME_SHARE = 0.15; // advance ≤ 15% of median weekly net
export const ABSOLUTE_CAP_MXN = 1500;
const CAP_STEP_MXN = 10; // caps round down to 10 MXN

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Coefficient of variation (population stdev / mean). 1 when mean is 0. */
export function cv(xs: number[]): number {
  const m = mean(xs);
  if (m <= 0) return 1;
  const variance = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(variance) / m;
}

export function computeFeatures(weeks: WeeklyEarnings[]): ScoreFeatures {
  const nets = weeks.map((w) => w.netMxn);
  const active = weeks.filter((w) => w.trips > 0);
  const trips = active.map((w) => w.trips);
  const medianNet = median(nets);
  const netCv = cv(nets);
  const tripsCv = active.length ? cv(trips) : 1;

  const components = {
    // Up to 35 pts: median weekly net, full marks at 8,000 MXN.
    income: r1(35 * clamp01(medianNet / 8000)),
    // Up to 30 pts: earnings stability; zero points at CV ≥ 0.6.
    stability: r1(30 * clamp01(1 - netCv / 0.6)),
    // Up to 20 pts: weeks with any trips, full marks at 8.
    activity: r1(20 * clamp01(active.length / 8)),
    // Up to 15 pts: trip-count consistency across active weeks; zero at CV ≥ 0.5.
    tripConsistency: r1(15 * clamp01(1 - tripsCv / 0.5)),
  };

  return {
    weeksObserved: weeks.length,
    activeWeeks: active.length,
    medianWeeklyNetMxn: r2(medianNet),
    meanWeeklyNetMxn: r2(mean(nets)),
    netEarningsCv: r4(netCv),
    tripsCv: r4(tripsCv),
    medianWeeklyTrips: median(trips),
    components,
  };
}

export type CapReason = "income-share" | "absolute-cap" | "ineligible";

export interface ScoreResult {
  score: number;
  eligible: boolean;
  features: ScoreFeatures;
  explanation: string[];
  /** Credit line in whole MXN (== xMXN), rounded down to 10. 0 when ineligible. */
  capMxn: number;
  capReason: CapReason;
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Score + credit line from earnings alone. Pool capacity is applied separately (see assessDriver). */
export function scoreDriver(weeks: WeeklyEarnings[]): ScoreResult {
  const f = computeFeatures(weeks);
  const c = f.components;
  const score = r1(c.income + c.stability + c.activity + c.tripConsistency);
  const explanation: string[] = [
    `Median weekly net earnings: ${fmt(f.medianWeeklyNetMxn)} MXN over ${f.weeksObserved} weeks (${c.income}/35 pts).`,
    `Earnings volatility (CV) ${f.netEarningsCv.toFixed(2)}: ${f.netEarningsCv < 0.15 ? "very steady" : f.netEarningsCv < 0.35 ? "moderately variable" : "highly variable"} income (${c.stability}/30 pts).`,
    `Active in ${f.activeWeeks} of ${f.weeksObserved} weeks (${c.activity}/20 pts).`,
    `Trip-count consistency (CV ${f.tripsCv.toFixed(2)}, median ${f.medianWeeklyTrips} trips/week) (${c.tripConsistency}/15 pts).`,
  ];

  const failures: string[] = [];
  if (f.activeWeeks < MIN_ACTIVE_WEEKS) failures.push(`needs at least ${MIN_ACTIVE_WEEKS} active weeks of history (has ${f.activeWeeks})`);
  if (f.medianWeeklyNetMxn < MIN_MEDIAN_NET_MXN) failures.push(`median weekly net is below ${fmt(MIN_MEDIAN_NET_MXN)} MXN`);
  if (score < SCORE_FLOOR) failures.push(`score ${score} is below the floor of ${SCORE_FLOOR}`);

  if (failures.length) {
    explanation.push(`Not eligible: ${failures.join("; ")}.`);
    explanation.push("Illustrative demo heuristic only, not a validated credit model.");
    return { score, eligible: false, features: f, explanation, capMxn: 0, capReason: "ineligible" };
  }

  const incomeCap = INCOME_SHARE * f.medianWeeklyNetMxn;
  const cap = Math.min(incomeCap, ABSOLUTE_CAP_MXN);
  const capReason: CapReason = incomeCap <= ABSOLUTE_CAP_MXN ? "income-share" : "absolute-cap";
  explanation.push(
    capReason === "income-share"
      ? `Advance limit is 15% of median weekly net (${fmt(incomeCap)} MXN), under the ${fmt(ABSOLUTE_CAP_MXN)} MXN ceiling.`
      : `15% of median weekly net is ${fmt(incomeCap)} MXN, so the ${fmt(ABSOLUTE_CAP_MXN)} MXN ceiling applies.`,
  );
  const capMxn = Math.floor(cap / CAP_STEP_MXN) * CAP_STEP_MXN;
  explanation.push(`Score ${score} ≥ floor ${SCORE_FLOOR}: credit line of ${fmt(capMxn)} xMXN. Illustrative demo heuristic only, not a validated credit model.`);
  return { score, eligible: true, features: f, explanation, capMxn, capReason };
}
