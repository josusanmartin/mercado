// v2 ABIs transcribed from crew/V2-DESIGN.md §3–§4, checked against packages/contracts/src/v2. Replace with the generated
// @mercado/shared abi/{MultiCollateralVault,MoveAMM} exports once contracts publishes them.
import { parseAbi } from "viem";

export const vaultV2Abi = parseAbi([
  "struct CollateralParams { address feed; uint16 mintRatioBps; uint16 liqRatioBps; uint16 liqPenaltyBps; uint128 debtCeiling; bool mintPaused; }",
  "function depositCollateral(address token, uint256 amount)",
  "function mint(address token, uint256 xmxn)",
  "function repayAndBurn(address token, uint256 xmxn)",
  "function withdrawCollateral(address token, uint256 amount)",
  "function getPosition(address user, address token) view returns (uint256 collateral, uint256 debt)",
  "function collateralRatio(address user, address token) view returns (uint256)",
  "function maxMintable(address user, address token) view returns (uint256)",
  "function maxWithdrawable(address user, address token) view returns (uint256)",
  "function isLiquidatable(address user, address token) view returns (bool)",
  "function collaterals() view returns (address[])",
  "function params(address token) view returns (CollateralParams)",
  "function totals(address token) view returns (uint256 collateral, uint256 debt)",
]);

export const moveAmmAbi = parseAbi([
  "function quote(bool usdToMxn, uint256 amountIn) view returns (uint256 amountOut, uint256 fee, uint256 midPrice, uint256 impactBps)",
  "function swapOusdForXmxn(uint256 amountIn, uint256 minOut, address to) returns (uint256 out)",
  "function swapXmxnForOusd(uint256 amountIn, uint256 minOut, address to) returns (uint256 out)",
  "function state() view returns (uint256 reserve, uint256 liability, uint256 equity, uint256 coverageBps, uint256 redeemedToday, uint256 redeemCap)",
]);

export const priceFeedAbi = parseAbi(["function price() view returns (uint256 px8, uint256 updatedAt)"]);

export const erc20MetaAbi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);
