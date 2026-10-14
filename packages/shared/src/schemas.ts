// Zod schemas for every Mercado HTTP route (owner: api). See INTERFACES.md → "HTTP API".
// Conventions: token amounts are 6-decimal base-unit integer strings ("1500000000" = 1,500 xMXN);
// fixture money fields (…Mxn) are plain MXN numbers with 2 decimals; FX is 8-decimal integer strings.
import { z } from "zod";

export const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed 20-byte address");
export const HexSchema = z.string().regex(/^0x[0-9a-fA-F]*$/, "expected 0x-prefixed hex");
export const Bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x-prefixed 32-byte hex");
/** Non-negative integer in base units, as a decimal string (bigint-safe over JSON). */
export const UintStringSchema = z.string().regex(/^\d+$/, "expected unsigned integer string");

export const DEMO_UBER_LABEL = "Demo Uber Data" as const;
export const SIMULATED_FULFILLMENT_LABEL = "SIMULATED fulfillment, no real top-up" as const;

// ---------- /api/fx ----------

export const FxSourceSchema = z.enum(["mock-admin-oracle", "config-fallback"]);

export const FxResponseSchema = z.object({
  /** 8-decimal integer string: 20.00 MXN/USD = "2000000000". */
  mxnPerUsd: UintStringSchema,
  /** Same value as a float, for display only. */
  rate: z.number(),
  /** Unix seconds. */
  updatedAt: z.number().int(),
  source: FxSourceSchema,
  isMock: z.boolean(),
  /** Oracle contract address when read on-chain. */
  oracle: AddressSchema.optional(),
  /** True when the oracle reverted or isn't deployed yet and we fell back to config. */
  stale: z.boolean().optional(),
  label: z.string(),
});

// ---------- /api/driver/demo ----------

export const DriverProfileIdSchema = z.enum(["steady", "irregular", "new-driver"]);

export const DriverProfileSchema = z.object({
  driverId: z.string(),
  firstName: z.string(),
  city: z.string(),
  vehicle: z.string(),
  rating: z.number(),
  activatedAt: z.string(), // YYYY-MM-DD
  currency: z.literal("MXN"),
  source: z.literal("demo-fixture"),
});

export const WeeklyEarningsSchema = z.object({
  weekStart: z.string(), // YYYY-MM-DD (Monday)
  weekEnd: z.string(),
  trips: z.number().int(),
  activeHours: z.number(),
  grossMxn: z.number(),
  serviceFeeMxn: z.number(),
  netMxn: z.number(),
});

export const PaymentRecordSchema = z.object({
  paymentId: z.string(),
  type: z.literal("weekly_payout"),
  paidAt: z.string(), // ISO datetime
  amountMxn: z.number(),
  currency: z.literal("MXN"),
  weekStart: z.string(),
});

/** Shape of fixtures/uber/*.json. */
export const EarningsFixtureSchema = z.object({
  label: z.literal(DEMO_UBER_LABEL),
  demo: z.literal(true),
  disclaimer: z.string(),
  profile: DriverProfileIdSchema,
  driver: DriverProfileSchema,
  weeks: z.array(WeeklyEarningsSchema),
  payments: z.array(PaymentRecordSchema),
});

export const DriverDemoQuerySchema = z.object({
  profile: DriverProfileIdSchema.default("steady"),
});

export const DriverDemoResponseSchema = z.object({
  demo: z.literal(true),
  label: z.literal(DEMO_UBER_LABEL),
  disclaimer: z.string(),
  profile: DriverProfileIdSchema,
  driver: DriverProfileSchema,
  weeks: z.array(WeeklyEarningsSchema),
  payments: z.array(PaymentRecordSchema),
});

// ---------- /api/driver/score ----------

export const DriverScoreRequestSchema = z.object({
  borrower: AddressSchema,
  profile: DriverProfileIdSchema,
});

export const ScoreFeaturesSchema = z.object({
  weeksObserved: z.number().int(),
  activeWeeks: z.number().int(),
  medianWeeklyNetMxn: z.number(),
  meanWeeklyNetMxn: z.number(),
  /** Coefficient of variation of weekly net earnings (stdev / mean), all observed weeks. */
  netEarningsCv: z.number(),
  /** Coefficient of variation of weekly trip counts, active weeks only. */
  tripsCv: z.number(),
  medianWeeklyTrips: z.number(),
  /** Points awarded per component; sums to `score`. */
  components: z.object({
    income: z.number(),
    stability: z.number(),
    activity: z.number(),
    tripConsistency: z.number(),
  }),
});

export const EligibilityAttestationSchema = z.object({
  borrower: AddressSchema,
  maxAmount: UintStringSchema, // xMXN, 6dp
  expiry: z.number().int(), // unix seconds
  nonce: UintStringSchema, // random uint256
  dataHash: Bytes32Schema, // keccak256(canonical JSON of the income report)
  signature: HexSchema,
  signer: AddressSchema,
  pool: AddressSchema,
  chainId: z.number().int(),
});

export const DriverScoreResponseSchema = z.object({
  demo: z.literal(true),
  label: z.string(),
  profile: DriverProfileIdSchema,
  eligible: z.boolean(),
  /** 0–100, deterministic for a given fixture. Illustrative only, not a validated credit model. */
  score: z.number(),
  scoreFloor: z.number(),
  features: ScoreFeaturesSchema,
  explanation: z.array(z.string()),
  /** xMXN 6dp; "0" when ineligible. */
  maxAmount: UintStringSchema,
  /** What bounded maxAmount: 15% of median weekly net, the 1,500 MXN ceiling, or pool liquidity. */
  capReason: z.enum(["income-share", "absolute-cap", "pool-liquidity", "ineligible"]),
  dataHash: Bytes32Schema,
  attestation: EligibilityAttestationSchema.optional(),
});

// ---------- /api/bills/* ----------

export const BillProviderIdSchema = z.enum(["telcel", "cfe"]);

export const BillQuoteRequestSchema = z.object({
  provider: BillProviderIdSchema,
  /** Telcel: 10-digit Mexican mobile number. */
  phone: z.string().regex(/^\d{10}$/).optional(),
  /** CFE: 12-digit service number. */
  serviceNumber: z.string().regex(/^\d{12}$/).optional(),
  /** MXN, whole or 2dp. Telcel accepts fixed denominations (see quote error). */
  amountMxn: z.number().positive(),
});

export const BillQuoteResponseSchema = z.object({
  quoteId: z.string(),
  provider: BillProviderIdSchema,
  /** Human description, e.g. "Telcel airtime 100 MXN → 55****1234". */
  description: z.string(),
  /** Face value in MXN. */
  amountMxn: z.number(),
  /** Amount charged via MPP, xMXN 6dp. */
  amount: UintStringSchema,
  /** TIP-20 token the MPP charge settles in. */
  token: AddressSchema,
  tokenSymbol: z.string(),
  recipient: AddressSchema,
  expiresAt: z.number().int(), // unix seconds
  simulated: z.literal(true),
  label: z.literal(SIMULATED_FULFILLMENT_LABEL),
});

export const BillPayRequestSchema = z.object({
  quoteId: z.string(),
  /** Client-generated (uuid). Same key → same order, never fulfilled twice. */
  idempotencyKey: z.string().min(8).max(128),
});

export const OrderStatusSchema = z.enum(["CREATED", "PAYMENT_VERIFIED", "FULFILLED_SIMULATED", "FAILED"]);

export const PaymentReceiptSchema = z.object({
  /** On-chain tx hash of the settled MPP payment (Tempo). */
  txHash: HexSchema,
  amount: UintStringSchema,
  token: AddressSchema,
  payer: AddressSchema.optional(),
  recipient: AddressSchema,
  chainId: z.number().int(),
  /** Raw MPP Payment-Receipt header, for auditing. */
  mppReceipt: z.string().optional(),
  verifiedAt: z.string(), // ISO
  explorerUrl: z.string().optional(),
});

export const FulfillmentSchema = z.object({
  reference: z.string(),
  simulated: z.literal(true),
  label: z.literal(SIMULATED_FULFILLMENT_LABEL),
  provider: BillProviderIdSchema,
  providerName: z.string(),
  status: z.enum(["SUCCESS", "FAILED"]),
  completedAt: z.string().optional(),
  message: z.string().optional(),
});

export const OrderHistoryEntrySchema = z.object({
  status: OrderStatusSchema,
  at: z.string(), // ISO
  note: z.string().optional(),
});

export const BillOrderSchema = z.object({
  orderId: z.string(),
  idempotencyKey: z.string(),
  quoteId: z.string(),
  provider: BillProviderIdSchema,
  description: z.string(),
  amountMxn: z.number(),
  amount: UintStringSchema,
  token: AddressSchema,
  status: OrderStatusSchema,
  /** Set when status is FAILED after the payment was verified: money moved, top-up did not. */
  paidButUnfulfilled: z.boolean(),
  receipt: PaymentReceiptSchema.optional(),
  fulfillment: FulfillmentSchema.optional(),
  history: z.array(OrderHistoryEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  simulated: z.literal(true),
});

/** 200 body of POST /api/bills/pay (the 402 body is the mppx problem+json challenge). */
export const BillPayResponseSchema = z.object({
  orderId: z.string(),
  status: OrderStatusSchema,
  paidButUnfulfilled: z.boolean(),
  receipt: PaymentReceiptSchema,
  fulfillment: FulfillmentSchema.optional(),
  order: BillOrderSchema,
});

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});
