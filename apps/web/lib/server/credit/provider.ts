// Earnings data providers for the credit service. Only the demo providers are functional: they serve
// deterministic, clearly labeled synthetic fixtures ("Demo Uber Data", "Demo DiDi Data", "Demo Rappi Data").
// No real platform data is used, and nothing is affiliated with Uber, DiDi or Rappi.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { EarningsFixtureSchema } from "@mercado/shared";
import { DEMO_PLATFORM_LABELS } from "@mercado/shared";
import type {
  DriverPlatform,
  DriverProfile,
  DriverProfileId,
  EarningsFixture,
  PaymentRecord,
  WeeklyEarnings,
} from "@mercado/shared";
import { repoRoot } from "../env";

export interface EarningsProvider {
  readonly id: string;
  readonly platform: DriverPlatform;
  readonly label: string;
  getDriverProfile(driverRef: string): Promise<DriverProfile>;
  /** Weekly trip/earnings aggregates, oldest first. */
  getTrips(driverRef: string): Promise<WeeklyEarnings[]>;
  getPayments(driverRef: string): Promise<PaymentRecord[]>;
}

// cached per file mtime, so an edited fixture is served without restarting the server
const cache = new Map<string, { mtimeMs: number; fixture: EarningsFixture }>();

export function loadFixture(profile: DriverProfileId, platform: DriverPlatform = "uber"): EarningsFixture {
  const key = `${platform}/${profile}`;
  const file = path.join(repoRoot(), "fixtures", platform, `${profile}.json`);
  const { mtimeMs } = statSync(file);
  const hit = cache.get(key);
  if (hit && hit.mtimeMs === mtimeMs) return hit.fixture;
  const fixture = EarningsFixtureSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  if (fixture.platform !== platform) throw new Error(`fixture ${key} is labeled ${fixture.platform}`);
  cache.set(key, { mtimeMs, fixture });
  return fixture;
}

/** Demo provider for one platform. driverRef is the demo profile id: "steady" | "irregular" | "new-driver". */
export class DemoEarningsProvider implements EarningsProvider {
  readonly id: string;
  readonly label: string;
  constructor(readonly platform: DriverPlatform = "uber") {
    this.id = `demo-${platform}`;
    this.label = DEMO_PLATFORM_LABELS[platform];
  }
  async getDriverProfile(driverRef: string) {
    return loadFixture(driverRef as DriverProfileId, this.platform).driver;
  }
  async getTrips(driverRef: string) {
    return loadFixture(driverRef as DriverProfileId, this.platform).weeks;
  }
  async getPayments(driverRef: string) {
    return loadFixture(driverRef as DriverProfileId, this.platform).payments;
  }
}

/** Demo DiDi (ride-hailing) earnings: synthetic "Demo DiDi Data". */
export class DemoDidiProvider extends DemoEarningsProvider {
  constructor() {
    super("didi");
  }
}

/** Demo Rappi (delivery) earnings: synthetic "Demo Rappi Data". */
export class DemoRappiProvider extends DemoEarningsProvider {
  constructor() {
    super("rappi");
  }
}

export function demoProvider(platform: DriverPlatform): EarningsProvider {
  return platform === "didi" ? new DemoDidiProvider() : platform === "rappi" ? new DemoRappiProvider() : new DemoEarningsProvider("uber");
}

/**
 * Future adapter for the Uber Driver API. NOT IMPLEMENTED: production access is restricted.
 *
 * - Auth: driver-initiated OAuth 2.0 authorization-code flow. We would never ask for the driver's
 *   password or scrape the Driver app.
 * - Scopes (all privileged, require Uber's approval for production use):
 *     partner.accounts  → GET /v1/partners/me        (profile, activation status, rating)
 *     partner.trips     → GET /v1/partners/trips     (trip history, distance, duration, status)
 *     partner.payments  → GET /v1/partners/payments  (fares, Uber fees, payouts, adjustments)
 * - Uber must approve the app (restricted scopes) before any non-test driver can connect.
 *   Docs: https://developer.uber.com/docs/drivers/guides/scopes
 * - Mapping: payments → WeeklyEarnings by ISO week (gross = fare, serviceFee = uber_fee, net = payout);
 *   trips → trip counts and active hours per week.
 */
export class UberEarningsProvider implements EarningsProvider {
  readonly id = "uber";
  readonly platform = "uber" as const;
  readonly label = "Uber Driver API (not connected)";
  private fail(): never {
    throw new Error(
      "UberEarningsProvider is a stub: requires Uber-approved access to partner.accounts, partner.trips and partner.payments scopes via driver OAuth. Use DemoEarningsProvider.",
    );
  }
  async getDriverProfile(): Promise<DriverProfile> {
    this.fail();
  }
  async getTrips(): Promise<WeeklyEarnings[]> {
    this.fail();
  }
  async getPayments(): Promise<PaymentRecord[]> {
    this.fail();
  }
}
