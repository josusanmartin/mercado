// Earnings data providers for the credit service. Only DemoEarningsProvider is functional; it serves
// deterministic, clearly labeled synthetic fixtures ("Demo Uber Data"). No real Uber data is used.
import { readFileSync } from "node:fs";
import path from "node:path";
import { EarningsFixtureSchema } from "@mercado/shared";
import type { DriverProfile, DriverProfileId, EarningsFixture, PaymentRecord, WeeklyEarnings } from "@mercado/shared";
import { repoRoot } from "../env";

export interface EarningsProvider {
  readonly id: string;
  readonly label: string;
  getDriverProfile(driverRef: string): Promise<DriverProfile>;
  /** Weekly trip/earnings aggregates, oldest first. */
  getTrips(driverRef: string): Promise<WeeklyEarnings[]>;
  getPayments(driverRef: string): Promise<PaymentRecord[]>;
}

const cache = new Map<DriverProfileId, EarningsFixture>();

export function loadFixture(profile: DriverProfileId): EarningsFixture {
  const hit = cache.get(profile);
  if (hit) return hit;
  const file = path.join(repoRoot(), "fixtures/uber", `${profile}.json`);
  const fixture = EarningsFixtureSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  cache.set(profile, fixture);
  return fixture;
}

/** driverRef is the demo profile id: "steady" | "irregular" | "new-driver". */
export class DemoEarningsProvider implements EarningsProvider {
  readonly id = "demo";
  readonly label = "Demo Uber Data";
  async getDriverProfile(driverRef: string) {
    return loadFixture(driverRef as DriverProfileId).driver;
  }
  async getTrips(driverRef: string) {
    return loadFixture(driverRef as DriverProfileId).weeks;
  }
  async getPayments(driverRef: string) {
    return loadFixture(driverRef as DriverProfileId).payments;
  }
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
