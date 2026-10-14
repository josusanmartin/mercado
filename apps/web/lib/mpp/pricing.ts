// Prices of Mercado's MPP-paid APIs, in decimal units of the active protocol's xMXN. The routes charge
// exactly these, and GET /api/mpp/pricing publishes them, so UI copy never hardcodes a price.
export const PRICES = {
  /** POST /api/driver/score?access=underwriter */
  underwriting: "2",
  /** GET /api/move/quote?access=partner (signed indicative quote) */
  "move-quote": "0.50",
} as const;
