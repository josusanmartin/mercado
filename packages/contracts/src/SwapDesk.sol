// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
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
///      Demo hardening (the faucet OUSD is free): each address may swap at most `dailyCapOusd` OUSD-equivalent
///      per 24h window (the window starts at the address's first swap after the previous one expired), and the
///      owner can pause swaps (e.g. during the on-chain FX stress demo). Anyone may `seed` inventory (a gift),
///      and only the owner can withdraw it.
contract SwapDesk is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant PRICE_SCALE = 1e8;

    IERC20 public immutable ousd;
    IERC20 public immutable xmxn;
    IFXOracleAdapter public immutable oracle;

    uint256 public spreadBps = 50;
    uint256 public maxSwapXmxn = 10_000e6;
    uint256 public dailyCapOusd = 2_000e6;
    uint256 public constant WINDOW = 1 days;
    uint256 public reserveOusd;
    uint256 public reserveXmxn;

    struct Usage {
        uint64 windowStart;
        uint192 used; // OUSD-equivalent, 6dp
    }

    mapping(address => Usage) public usage;

    event Swapped(address indexed user, bool ousdToXmxn, uint256 amountIn, uint256 amountOut, uint256 fee);
    event Seeded(address indexed from, uint256 ousd, uint256 xmxn);
    event ReservesWithdrawn(address indexed to, uint256 ousd, uint256 xmxn);
    event ParamsUpdated(uint256 spreadBps, uint256 maxSwapXmxn, uint256 dailyCapOusd);

    error ZeroAmount();
    error SwapTooLarge(uint256 xmxnEquivalent, uint256 max);
    error InsufficientReserves(uint256 available, uint256 needed);
    error Slippage(uint256 amountOut, uint256 minOut);
    error InvalidParams();
    error DailyCapExceeded(uint256 usedAfter, uint256 cap);

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

    /// @notice OUSD-equivalent `user` can still swap in the current 24h window.
    function remainingDailyCap(address user) public view returns (uint256) {
        Usage memory u = usage[user];
        uint256 used = block.timestamp >= uint256(u.windowStart) + WINDOW ? 0 : u.used;
        return used >= dailyCapOusd ? 0 : dailyCapOusd - used;
    }

    // ---------------------------------------------------------------- swaps

    function swapOusdForXmxn(uint256 amountIn, uint256 minOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        uint256 fee;
        (amountOut, fee) = quote(true, amountIn);
        if (amountOut < minOut) revert Slippage(amountOut, minOut);
        _useCap(msg.sender, amountIn);
        reserveOusd += amountIn;
        reserveXmxn -= amountOut;
        ousd.safeTransferFrom(msg.sender, address(this), amountIn);
        xmxn.safeTransfer(msg.sender, amountOut);
        emit Swapped(msg.sender, true, amountIn, amountOut, fee);
    }

    function swapXmxnForOusd(uint256 amountIn, uint256 minOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        uint256 fee;
        (amountOut, fee) = quote(false, amountIn);
        if (amountOut < minOut) revert Slippage(amountOut, minOut);
        _useCap(msg.sender, amountOut + fee);
        reserveXmxn += amountIn;
        reserveOusd -= amountOut;
        xmxn.safeTransferFrom(msg.sender, address(this), amountIn);
        ousd.safeTransfer(msg.sender, amountOut);
        emit Swapped(msg.sender, false, amountIn, amountOut, fee);
    }

    function _useCap(address user, uint256 ousdEquivalent) internal {
        Usage memory u = usage[user];
        if (block.timestamp >= uint256(u.windowStart) + WINDOW) {
            u.windowStart = uint64(block.timestamp);
            u.used = 0;
        }
        uint256 usedAfter = uint256(u.used) + ousdEquivalent;
        if (usedAfter > dailyCapOusd) revert DailyCapExceeded(usedAfter, dailyCapOusd);
        u.used = uint192(usedAfter);
        usage[user] = u;
    }

    // ---------------------------------------------------------------- inventory

    /// @notice Add inventory from the caller's own balances (needs approvals). Permissionless: seeding is a
    ///         gift to the desk; only the owner can withdraw reserves.
    function seed(uint256 ousdAmount, uint256 xmxnAmount) external nonReentrant {
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

    // ---------------------------------------------------------------- owner

    function withdrawReserves(uint256 ousdAmount, uint256 xmxnAmount, address to) external onlyOwner nonReentrant {
        if (ousdAmount > reserveOusd) revert InsufficientReserves(reserveOusd, ousdAmount);
        if (xmxnAmount > reserveXmxn) revert InsufficientReserves(reserveXmxn, xmxnAmount);
        reserveOusd -= ousdAmount;
        reserveXmxn -= xmxnAmount;
        if (ousdAmount > 0) ousd.safeTransfer(to, ousdAmount);
        if (xmxnAmount > 0) xmxn.safeTransfer(to, xmxnAmount);
        emit ReservesWithdrawn(to, ousdAmount, xmxnAmount);
    }

    function setParams(uint256 spreadBps_, uint256 maxSwapXmxn_, uint256 dailyCapOusd_) external onlyOwner {
        if (spreadBps_ > 1_000 || maxSwapXmxn_ == 0 || dailyCapOusd_ == 0 || dailyCapOusd_ > type(uint192).max) {
            revert InvalidParams();
        }
        spreadBps = spreadBps_;
        maxSwapXmxn = maxSwapXmxn_;
        dailyCapOusd = dailyCapOusd_;
        emit ParamsUpdated(spreadBps_, maxSwapXmxn_, dailyCapOusd_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
