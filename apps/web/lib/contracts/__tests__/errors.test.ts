import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionExecutionError, ContractFunctionRevertedError, encodeErrorResult, parseAbi } from "viem";
import { mercadoCardAbi } from "@mercado/shared";
import { readableError } from "../errors";
import { ADDR } from "../addresses";

describe("readable Card errors (Spanish first)", () => {
  it("CardIsFrozen / OverDailyLimit decode to friendly copy", () => {
    for (const [errorName, args, re] of [
      ["CardIsFrozen", [1n], /Tarjeta congelada/],
      ["OverDailyLimit", [1_100_000_000n, 1_000_000_000n], /Supera tu límite diario.*1,100.*1,000.*medianoche/],
    ] as const) {
      const data = encodeErrorResult({ abi: mercadoCardAbi, errorName, args } as never);
      const err = new BaseError("reverted", { cause: new ContractFunctionRevertedError({ abi: mercadoCardAbi as never, data, functionName: "charge" }) });
      expect(readableError(err)).toMatch(re);
    }
  });

  it("shared token errors read Spanish on a Card call, English elsewhere, and lang forces it", () => {
    const tip20 = parseAbi(["error InsufficientBalance(uint256 available, uint256 required)"]);
    const data = encodeErrorResult({ abi: tip20, errorName: "InsufficientBalance", args: [5_000_000n, 150_000_000n] });
    const at = (contractAddress: `0x${string}`) =>
      new ContractFunctionExecutionError(new ContractFunctionRevertedError({ abi: tip20 as never, data, functionName: "charge" }), {
        abi: tip20 as never,
        functionName: "charge",
        contractAddress,
      });
    expect(readableError(at(ADDR.card))).toMatch(/Saldo insuficiente: tienes 5 xMXN y necesitas 150/);
    expect(readableError(at(ADDR.xmxn))).toMatch(/Insufficient balance: you have 5, need 150/);
    expect(readableError(at(ADDR.xmxn), { lang: "es" })).toMatch(/Saldo insuficiente/);
  });
});
