// Local fallback ABIs transcribed from INTERFACES.md. Swapped for the generated
// ABIs in @mercado/shared/abi once `contracts` exports them.
import { erc20Abi, parseAbi } from "viem";

export const tokenAbi = erc20Abi;

export const oracleAbi = parseAbi([
  "function price() view returns (uint256 mxnPerUsd, uint256 updatedAt)",
  "function decimals() pure returns (uint8)",
  "function maxAge() view returns (uint256)",
  "function isMock() view returns (bool)",
]);

export const vaultAbi = parseAbi([
  "struct Position { uint256 collateral; uint256 debt; }",
  "function depositCollateral(uint256 amount)",
  "function mint(uint256 xmxnAmount)",
  "function repayAndBurn(uint256 xmxnAmount)",
  "function withdrawCollateral(uint256 amount)",
  "function liquidate(address user, uint256 debtToCover)",
  "function getPosition(address user) view returns (Position)",
  "function collateralRatio(address user) view returns (uint256)",
  "function maxMintable(address user) view returns (uint256)",
  "event Deposited(address indexed user, uint256 amount)",
  "event Minted(address indexed user, uint256 amount)",
  "event Repaid(address indexed user, uint256 amount)",
  "event Withdrawn(address indexed user, uint256 amount)",
]);

export const swapDeskAbi = parseAbi([
  "function quote(bool ousdToXmxn, uint256 amountIn) view returns (uint256 amountOut, uint256 fee)",
  "function swapOusdForXmxn(uint256 amountIn, uint256 minOut) returns (uint256 amountOut)",
  "function swapXmxnForOusd(uint256 amountIn, uint256 minOut) returns (uint256 amountOut)",
  "function reserves() view returns (uint256 ousd, uint256 xmxn)",
  "event Swapped(address indexed user, bool ousdToXmxn, uint256 amountIn, uint256 amountOut, uint256 fee)",
]);

export const creditPoolAbi = parseAbi([
  "function supply(uint256 amount)",
  "function withdrawAvailable(uint256 amount)",
  "function borrow(uint256 amount, uint256 maxAmount, uint256 expiry, uint256 nonce, bytes32 dataHash, bytes signature)",
  "function repay(uint256 amount)",
  "function getDebt(address borrower) view returns (uint256)",
  "function availableLiquidity() view returns (uint256)",
  "function lenderBalance(address lender) view returns (uint256)",
  "function stats() view returns (uint256 totalSupplied, uint256 totalBorrowed, uint256 outstanding, uint256 realizedFees)",
  "function attestationSigner() view returns (address)",
  "function nonceUsed(address borrower, uint256 nonce) view returns (bool)",
]);
