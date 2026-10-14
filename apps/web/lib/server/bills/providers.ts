// Bill providers. Everything here is SIMULATED: no real top-up or bill payment happens.
// MPP is the payment rail (HTTP 402); it is not itself a bill-payment provider.
import { createHash } from "node:crypto";
import { SIMULATED_FULFILLMENT_LABEL } from "@mercado/shared";
import type { BillProviderId, BillQuoteRequest, Fulfillment } from "@mercado/shared";

export interface ProviderQuote {
  provider: BillProviderId;
  description: string;
  amountMxn: number;
  /** Account identifier the top-up/bill applies to (phone or service number). */
  account: string;
}

export class BillQuoteError extends Error {}

export interface BillProvider {
  readonly id: BillProviderId;
  readonly name: string;
  quote(req: BillQuoteRequest): Promise<ProviderQuote>;
  /** Must be idempotent per orderId: calling twice returns the same reference and never double-fulfills. */
  execute(orderId: string, quote: ProviderQuote): Promise<Fulfillment>;
  getStatus(reference: string): Promise<Fulfillment["status"] | "UNKNOWN">;
}

const mask = (s: string) => `${s.slice(0, 2)}****${s.slice(-4)}`;
const digits = (seed: string, n: number) =>
  (BigInt("0x" + createHash("sha256").update(seed).digest("hex")) % 10n ** BigInt(n)).toString().padStart(n, "0");
const ymd = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

abstract class MockProvider implements BillProvider {
  abstract readonly id: BillProviderId;
  abstract readonly name: string;
  abstract quote(req: BillQuoteRequest): Promise<ProviderQuote>;
  protected abstract refPrefix: string;
  private executed = new Map<string, Fulfillment>();

  async execute(orderId: string, quote: ProviderQuote): Promise<Fulfillment> {
    const prior = this.executed.get(orderId);
    if (prior) return prior;
    // Deterministic failure hook for demoing paid-but-unfulfilled handling: accounts ending in 0000.
    const fail = quote.account.endsWith("0000");
    const reference = `${this.refPrefix}-${ymd()}-${digits(orderId, 8)}`;
    const result: Fulfillment = {
      reference,
      simulated: true,
      label: SIMULATED_FULFILLMENT_LABEL,
      provider: this.id,
      providerName: this.name,
      status: fail ? "FAILED" : "SUCCESS",
      completedAt: new Date().toISOString(),
      message: fail
        ? "Simulated provider rejection (demo accounts ending in 0000 always fail)."
        : `Simulated: ${quote.description}. No real ${this.id === "telcel" ? "airtime was sent" : "bill was paid"}.`,
    };
    this.executed.set(orderId, result);
    return result;
  }

  async getStatus(reference: string) {
    for (const f of this.executed.values()) if (f.reference === reference) return f.status;
    return "UNKNOWN" as const;
  }
}

/** Mock Telcel prepaid airtime ("recarga"). Fixed denominations like the real product. */
export class MockTelcelProvider extends MockProvider {
  readonly id = "telcel" as const;
  readonly name = "Telcel (mock)";
  protected refPrefix = "TLC";
  static readonly DENOMINATIONS = [20, 30, 50, 80, 100, 150, 200, 300, 500];
  async quote(req: BillQuoteRequest): Promise<ProviderQuote> {
    if (!req.phone) throw new BillQuoteError("phone (10 digits) is required for Telcel");
    if (!MockTelcelProvider.DENOMINATIONS.includes(req.amountMxn))
      throw new BillQuoteError(`Telcel amount must be one of ${MockTelcelProvider.DENOMINATIONS.join(", ")} MXN`);
    return {
      provider: this.id,
      account: req.phone,
      amountMxn: req.amountMxn,
      description: `Telcel airtime ${req.amountMxn} MXN → ${mask(req.phone)}`,
    };
  }
}

/** Mock CFE electricity bill. */
export class MockCFEProvider extends MockProvider {
  readonly id = "cfe" as const;
  readonly name = "CFE (mock)";
  protected refPrefix = "CFE";
  async quote(req: BillQuoteRequest): Promise<ProviderQuote> {
    if (!req.serviceNumber) throw new BillQuoteError("serviceNumber (12 digits) is required for CFE");
    if (req.amountMxn < 20 || req.amountMxn > 1500) throw new BillQuoteError("CFE demo amount must be 20–1,500 MXN");
    const amountMxn = Math.round(req.amountMxn * 100) / 100;
    return {
      provider: this.id,
      account: req.serviceNumber,
      amountMxn,
      description: `CFE electricity bill ${amountMxn} MXN, service ${mask(req.serviceNumber)}`,
    };
  }
}

/**
 * Future: Arcus (https://docs.arcusfi.com/es/api/) or another contractually integrated Mexican
 * airtime/bill aggregator. Requires commercial onboarding and a prefunded fiat (MXN) working balance;
 * on-chain xMXN would have to be off-ramped to fund it. Not implemented.
 */
export class ArcusProvider implements BillProvider {
  readonly id = "telcel" as const;
  readonly name = "Arcus (not connected)";
  private fail(): never {
    throw new Error("ArcusProvider is a stub: needs a commercial Arcus agreement, API keys and a funded MXN balance.");
  }
  async quote(): Promise<ProviderQuote> {
    this.fail();
  }
  async execute(): Promise<Fulfillment> {
    this.fail();
  }
  async getStatus(): Promise<"UNKNOWN"> {
    this.fail();
  }
}

const registry: Record<BillProviderId, BillProvider> = {
  telcel: new MockTelcelProvider(),
  cfe: new MockCFEProvider(),
};

export function getBillProvider(id: BillProviderId): BillProvider {
  return registry[id];
}
