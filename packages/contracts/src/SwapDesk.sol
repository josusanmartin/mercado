// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IFXOracleAdapter} from "./interfaces/IFXOracleAdapter.sol";

/// @title SwapDesk: separately capitalized OUSD <-> xMXN desk (TESTNET PROTOTYPE)
/// @notice Quotes at the oracle price minus a spread, against finite reserves the owner seeded. The desk
///         has no link to CollateralVault and can never spend CDP collateral: it only moves its own tracked
///         reserves. It is not a market and offers no peg.
/// @dev Precision: OUSD and xMXN amounts are 6dp; the oracle price is 8dp MXN per USD.
///        OUSD -> xMXN: gross = amountIn * px / 1e8; fee = gross * spreadBps / 1e4; out = gross - fee (xMXN)
///        xMXN -> OUSD: gross = amountIn * 1e8 / px; fee = gross * spreadBps / 1e4; out = gross - fee (OUSD)
///      Fees stay in the desk's reserves. Each swap is capped at `maxSwapXmxn` xMXN-equivalent.
///      Reserves are tracked internally, so tokens sent straight to the desk aren't counted.
contract SwapDesk is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant PRICE_SCALE = 1e8;

    IERC20 public immutable ousd;
    IERC20 public immutable xmxn;
    IFXOracleAdapter public immutable oracle;

    uint256 public spreadBps = 50;
    uint256 public maxSwapXmxn = 10_000e6;
    uint256 public reserveOusd;
    uint256 public reserveXmxn;

    event Swapped(address indexed user, bool ousdToXmxn, uint256 amountIn, uint256 amountOut, uint256 fee);
    event Seeded(address indexed from, uint256 ousd, uint256 xmxn);
    event ReservesWithdrawn(address indexed to, uint256 ousd, uint256 xmxn);
    event ParamsUpdated(uint256 spreadBps, uint256 maxSwapXmxn);

    error ZeroAmount();
    error SwapTooLarge(uint256 xmxnEquivalent, uint256 max);
    error InsufficientReserves(uint256 available, uint256 needed);
    error Slippage(uint256 amountOut, uint256 minOut);
    error InvalidParams();

    constructor(address owner_, IERC20 ousd_, IERC20 xmxn_, IFXOracleAdapter oracle_) Ownable(owner_) {
        ousd = ousd_;
        xmxn = xmxn_;
        oracle = oracle_;
    }

    // ---------------------------------------------------------------- quotes

    /// @notice Quote a swap at the current oracle price. Reverts on an invalid price, an oversize swap or
    ///         insufficient reserves. `fee` is in output-token units.
    function quote(bool ousdToXmxn, uint256 amountIn) public view returns (uint256 amountOut, uint256 fee) {
        if (amountIn == 0) revert ZeroAmount();
        (uint256 px,) = oracle.price();
        uint256 gross;
        uint256 xmxnEquivalent;
        if (ousdToXmxn) {
            gross = Math.mulDiv(amountIn, px, PRICE_SCALE);
            xmxnEquivalent = gross;
        } else {
            gross = Math.mulDiv(amountIn, PRICE_SCALE, px);
            xmxnEquivalent = amountIn;
        }
        if (xmxnEquivalent > maxSwapXmxn) revert SwapTooLarge(xmxnEquivalent, maxSwapXmxn);
        fee = Math.mulDiv(gross, spreadBps, BPS, Math.Rounding.Ceil);
        amountOut = gross - fee;
        if (amountOut == 0) revert ZeroAmount();
        uint256 available = ousdToXmxn ? reserveXmxn : reserveOusd;
        if (amountOut > available) revert InsufficientReserves(available, amountOut);
    }

    function reserves() external view returns (uint256, uint256) {
        return (reserveOusd, reserveXmxn);
    }

    // ---------------------------------------------------------------- swaps

    function swapOusdForXmxn(uint256 amountIn, uint256 minOut) external nonReentrant returns (uint256 amountOut) {
        uint256 fee;
        (amountOut, fee) = quote(true, amountIn);
        if (amountOut < minOut) revert Slippage(amountOut, minOut);
        reserveOusd += amountIn;
        reserveXmxn -= amountOut;
        ousd.safeTransferFrom(msg.sender, address(this), amountIn);
        xmxn.safeTransfer(msg.sender, amountOut);
        emit Swapped(msg.sender, true, amountIn, amountOut, fee);
    }

    function swapXmxnForOusd(uint256 amountIn, uint256 minOut) external nonReentrant returns (uint256 amountOut) {
        uint256 fee;
        (amountOut, fee) = quote(false, amountIn);
        if (amountOut < minOut) revert Slippage(amountOut, minOut);
        reserveXmxn += amountIn;
        reserveOusd -= amountOut;
        xmxn.safeTransferFrom(msg.sender, address(this), amountIn);
        ousd.safeTransfer(msg.sender, amountOut);
        emit Swapped(msg.sender, false, amountIn, amountOut, fee);
    }

    // ---------------------------------------------------------------- owner

    /// @notice Add inventory from the owner's own balances (needs approvals).
    function seed(uint256 ousdAmount, uint256 xmxnAmount) external onlyOwner nonReentrant {
        if (ousdAmount > 0) {
            reserveOusd += ousdAmount;
            ousd.safeTransferFrom(msg.sender, address(this), ousdAmount);
        }
        if (xmxnAmount > 0) {
            reserveXmxn += xmxnAmount;
            xmxn.safeTransferFrom(msg.sender, address(this), xmxnAmount);
        }
        emit Seeded(msg.sender, ousdAmount, xmxnAmount);
    }

    function withdrawReserves(uint256 ousdAmount, uint256 xmxnAmount, address to) external onlyOwner nonReentrant {
        if (ousdAmount > reserveOusd) revert InsufficientReserves(reserveOusd, ousdAmount);
        if (xmxnAmount > reserveXmxn) revert InsufficientReserves(reserveXmxn, xmxnAmount);
        reserveOusd -= ousdAmount;
        reserveXmxn -= xmxnAmount;
        if (ousdAmount > 0) ousd.safeTransfer(to, ousdAmount);
        if (xmxnAmount > 0) xmxn.safeTransfer(to, xmxnAmount);
        emit ReservesWithdrawn(to, ousdAmount, xmxnAmount);
    }

    function setParams(uint256 spreadBps_, uint256 maxSwapXmxn_) external onlyOwner {
        if (spreadBps_ > 1_000 || maxSwapXmxn_ == 0) revert InvalidParams();
        spreadBps = spreadBps_;
        maxSwapXmxn = maxSwapXmxn_;
        emit ParamsUpdated(spreadBps_, maxSwapXmxn_);
    }
}
