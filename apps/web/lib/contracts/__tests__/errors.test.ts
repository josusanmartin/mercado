import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { mercadoCardAbi } from "@mercado/shared";
import { readableError } from "../errors";

describe("readable Card errors (Spanish first)", () => {
  it("CardIsFrozen / OverDailyLimit decode to friendly copy", () => {
    for (const [errorName, args, re] of [
      ["CardIsFrozen", [1n], /Tarjeta congelada/],
      ["OverDailyLimit", [1_100_000_000n, 1_000_000_000n], /Supera tu límite diario.*1,100.*1,000.*midnight CDMX/],
    ] as const) {
      const data = encodeErrorResult({ abi: mercadoCardAbi, errorName, args } as never);
      const err = new BaseError("reverted", { cause: new ContractFunctionRevertedError({ abi: mercadoCardAbi as never, data, functionName: "charge" }) });
      expect(readableError(err)).toMatch(re);
    }
  });
});
