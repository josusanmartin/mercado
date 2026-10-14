// Generated v2 ABIs (packages/contracts/script/export.mjs) under the names lib/v2 uses.
import { parseAbi } from "viem";
export { multiCollateralVaultAbi as vaultV2Abi, moveAmmAbi, priceFeedAbi } from "@mercado/shared";

export const erc20MetaAbi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);
