// Global amount input (lead 06:45): grouped thousands normalize, malformed groups get an actionable error,
// so a quote never sits on "Pricing…" forever.
import { describe, expect, it } from "vitest";
import { normalizeAmount } from "@/components/global/use-move-quote";

describe("normalizeAmount", () => {
  it.each([
    ["1000", "1000"],
    ["1,000", "1000"],
    ["1000.5", "1000.5"],
    ["1,000.50", "1000.50"],
    ["12,345,678.123456", "12345678.123456"],
    ["10.", "10"],
  ])("%s → %s", (raw, clean) => {
    expect(normalizeAmount(raw)).toEqual({ clean });
  });

  it.each(["1,00", "1,0,00", "1.2.3", "abc", "1,0000"])("%s → format error, never a quote", (raw) => {
    const r = normalizeAmount(raw);
    expect(r.clean).toBeUndefined();
    expect(r.error).toMatch(/digits/);
  });

  it("more than 6 decimals is refused", () => {
    expect(normalizeAmount("1.1234567")).toEqual({ error: "At most 6 decimals." });
  });

  it("empty is neither a value nor an error (the UI says 'Enter an amount')", () => {
    expect(normalizeAmount("")).toEqual({});
    expect(normalizeAmount("  ")).toEqual({});
  });
});
