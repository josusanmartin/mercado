// TS types for the Mercado HTTP API (owner: api), inferred from ./schemas.ts.
import type { z } from "zod";
import type * as S from "./schemas";

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export type FxSource = z.infer<typeof S.FxSourceSchema>;
export type FxResponse = z.infer<typeof S.FxResponseSchema>;

export type DriverProfileId = z.infer<typeof S.DriverProfileIdSchema>;
export type DriverProfile = z.infer<typeof S.DriverProfileSchema>;
export type WeeklyEarnings = z.infer<typeof S.WeeklyEarningsSchema>;
export type PaymentRecord = z.infer<typeof S.PaymentRecordSchema>;
export type EarningsFixture = z.infer<typeof S.EarningsFixtureSchema>;
export type DriverDemoResponse = z.infer<typeof S.DriverDemoResponseSchema>;

export type DriverScoreRequest = z.infer<typeof S.DriverScoreRequestSchema>;
export type ScoreFeatures = z.infer<typeof S.ScoreFeaturesSchema>;
export type EligibilityAttestation = z.infer<typeof S.EligibilityAttestationSchema>;
export type DriverScoreResponse = z.infer<typeof S.DriverScoreResponseSchema>;

export type BillProviderId = z.infer<typeof S.BillProviderIdSchema>;
export type BillQuoteRequest = z.infer<typeof S.BillQuoteRequestSchema>;
export type BillQuoteResponse = z.infer<typeof S.BillQuoteResponseSchema>;
export type BillPayRequest = z.infer<typeof S.BillPayRequestSchema>;
export type OrderStatus = z.infer<typeof S.OrderStatusSchema>;
export type PaymentReceipt = z.infer<typeof S.PaymentReceiptSchema>;
export type Fulfillment = z.infer<typeof S.FulfillmentSchema>;
export type OrderHistoryEntry = z.infer<typeof S.OrderHistoryEntrySchema>;
export type BillOrder = z.infer<typeof S.BillOrderSchema>;
export type BillPayResponse = z.infer<typeof S.BillPayResponseSchema>;
export type ApiError = z.infer<typeof S.ApiErrorSchema>;
