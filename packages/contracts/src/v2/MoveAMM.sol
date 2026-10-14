// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {IPriceFeed} from "./IPriceFeed.sol";

/// @title MoveAMM: MOVE module, the vault-integrated vAMM / peg-stability module for OUSD ⇄ xMXN (TESTNET)
/// @notice OUSD in MINTS xMXN; xMXN in is BURNED and redeems OUSD from this contract's own reserve. Pricing is the
///         oracle mid on a virtual constant-product curve (size-dependent impact) plus a fee. It never holds or
///         reads CDP collateral: its only assets are its own tracked OUSD reserve.
/// @dev Balance sheet (all tracked internally; direct transfers are ignored):
///        R = OUSD reserve (mint inflows + fees + equity − redemptions)
///        L = xMXN liability: xMXN this AMM issued and hasn't bought back
///        coverage c = R × mid / L  (bps; max if L = 0)
///      Rules:
///        - mint (OUSD → xMXN): reverts if coverage after < minMintCoverageBps (100%), or L > maxLiability
///        - redeem (xMXN → OUSD): amountIn ≤ L (CDP-minted xMXN may redeem only up to the AMM's own liability,
///          so nobody can drain the equity buffer), paid at min(oracle, NAV): out × min(1, c), extra stress
///          spread below stressThresholdBps; out ≤ R; rate-limited by a leaky bucket (below)
///        - equity: anyone may add OUSD equity (raises R, not L); the owner may withdraw only while c ≥ target after
///      Redemption rate limit (strict leaky bucket, no floor): capacity C = R × redeemCapBps (25%), refilling
///        continuously at C per 24h. At most C can leave at once; with no fixed window there is no boundary
///        doubling. C shrinks as R shrinks, so a run slows itself down. Demo usability comes from equity
///        (≥ 2,500 OUSD), not from a floor.
///      Curve: usd → mxn: gross = usd × mid × D / (D + usd);  mxn → usd: gross = (mxn / mid) × D / (D + mxn/mid).
contract MoveAMM is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant PX = 1e8;

    IERC20 public immutable ousd;
    ITIP20 public immutable xmxn;
    IPriceFeed public immutable fx; // MXN per USD, 8dp

    uint256 public reserve; // OUSD 6dp
    uint256 public liability; // xMXN 6dp
    uint256 public equity; // OUSD contributed as equity, net of withdrawals (informational)

    uint256 public feeBps = 20;
    uint256 public depthUsd = 250_000e6;
    uint256 public maxSwapUsd = 10_000e6;
    uint256 public redeemCapBps = 2_500;
    uint256 public maxLiability = 2_000_000e6;
    uint256 public minMintCoverageBps = 10_000;
    uint256 public targetCoverageBps = 12_000;
    uint256 public stressThresholdBps = 11_000;
    uint256 public stressBps = 30;

    uint256 public bucket; // OUSD redeemed, leaking at capacity per 24h
    uint256 public bucketAt;

    event Swapped(
        address indexed user, address indexed to, bool usdToMxn, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 impactBps, uint256 mid
    );
    event EquityAdded(address indexed from, uint256 amount);
    event EquityWithdrawn(address indexed to, uint256 amount);
    event ParamsUpdated();

    error ZeroAmount();
    error SwapTooLarge(uint256 usdEquivalent, uint256 max);
    error Slippage(uint256 amountOut, uint256 minOut);
    error CoverageTooLow(uint256 coverageAfterBps, uint256 requiredBps);
    error LiabilityCeiling(uint256 liabilityAfter, uint256 max);
    error ExceedsLiability(uint256 liability, uint256 requested);
    error InsufficientReserve(uint256 reserve, uint256 needed);
    error RedeemCapExceeded(uint256 redeemedAfter, uint256 cap);
    error InvalidParams();

    constructor(address owner_, IERC20 ousd_, ITIP20 xmxn_, IPriceFeed fx_) Ownable(owner_) {
        if (fx_.decimals() != 8) revert InvalidParams();
        ousd = ousd_;
        xmxn = xmxn_;
        fx = fx_;
    }

    // ---------------------------------------------------------------- quotes

    /// @notice Quote a swap at the current oracle mid. `fee` is in output units; `impactBps` is the size impact
    ///         vs the mid (before fee). Reverts with the same custom errors the swap would.
    function quote(bool usdToMxn, uint256 amountIn)
        public
        view
        returns (uint256 amountOut, uint256 fee, uint256 midPrice, uint256 impactBps)
    {
        if (amountIn == 0) revert ZeroAmount();
        if (paused()) revert EnforcedPause(); // quotes are never offered for an impossible trade
        (midPrice,) = fx.price();
        if (usdToMxn) {
            if (amountIn > maxSwapUsd) revert SwapTooLarge(amountIn, maxSwapUsd);
            uint256 atMid = Math.mulDiv(amountIn, midPrice, PX);
            uint256 gross = Math.mulDiv(atMid, depthUsd, depthUsd + amountIn);
            impactBps = atMid == 0 ? 0 : Math.mulDiv(atMid - gross, BPS, atMid, Math.Rounding.Ceil);
            fee = Math.mulDiv(gross, feeBps, BPS, Math.Rounding.Ceil);
            amountOut = gross - fee;
            if (liability + amountOut > maxLiability) revert LiabilityCeiling(liability + amountOut, maxLiability);
            uint256 covAfter = _coverage(reserve + amountIn, liability + amountOut, midPrice);
            if (covAfter < minMintCoverageBps) revert CoverageTooLow(covAfter, minMintCoverageBps);
        } else {
            if (amountIn > liability) revert ExceedsLiability(liability, amountIn);
            uint256 usdAtMid = Math.mulDiv(amountIn, PX, midPrice);
            if (usdAtMid > maxSwapUsd) revert SwapTooLarge(usdAtMid, maxSwapUsd);
            uint256 gross = Math.mulDiv(usdAtMid, depthUsd, depthUsd + usdAtMid);
            impactBps = usdAtMid == 0 ? 0 : Math.mulDiv(usdAtMid - gross, BPS, usdAtMid, Math.Rounding.Ceil);
            uint256 cov = _coverage(reserve, liability, midPrice);
            uint256 spread = feeBps + (cov < stressThresholdBps ? stressBps : 0);
            fee = Math.mulDiv(gross, spread, BPS, Math.Rounding.Ceil);
            amountOut = gross - fee;
            if (cov < BPS) amountOut = Math.mulDiv(amountOut, cov, BPS); // NAV: pro-rata when under-covered
            if (amountOut > reserve) revert InsufficientReserve(reserve, amountOut);
            (uint256 used, uint256 cap) = _bucket();
            if (used + amountOut > cap) revert RedeemCapExceeded(used + amountOut, cap);
        }
        if (amountOut == 0) revert ZeroAmount();
    }

    /// @return reserve_ OUSD; liability_ xMXN; equity_ OUSD; coverageBps (max if no liability);
    ///         redeemedToday = current bucket level (OUSD); redeemCap = bucket capacity C (OUSD)
    function state()
        external
        view
        returns (uint256 reserve_, uint256 liability_, uint256 equity_, uint256 coverageBps, uint256 redeemedToday, uint256 redeemCap)
    {
        (uint256 mid,) = fx.price();
        (redeemedToday, redeemCap) = _bucket();
        return (reserve, liability, equity, _coverage(reserve, liability, mid), redeemedToday, redeemCap);
    }

    // ---------------------------------------------------------------- swaps

    /// @notice OUSD → xMXN. Mints fresh xMXN to `to` (e.g. a remittance recipient) against the OUSD paid in.
    function swapOusdForXmxn(uint256 amountIn, uint256 minOut, address to)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        uint256 fee;
        uint256 mid;
        uint256 impact;
        (amountOut, fee, mid, impact) = quote(true, amountIn);
        if (amountOut < minOut) revert Slippage(amountOut, minOut);
        reserve += amountIn;
        liability += amountOut;
        ousd.safeTransferFrom(msg.sender, address(this), amountIn);
        xmxn.mint(to, amountOut);
        emit Swapped(msg.sender, to, true, amountIn, amountOut, fee, impact, mid);
    }

    /// @notice xMXN → OUSD. Burns the xMXN paid in and pays OUSD from this AMM's reserve only.
    function swapXmxnForOusd(uint256 amountIn, uint256 minOut, address to)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        uint256 fee;
        uint256 mid;
        uint256 impact;
        (amountOut, fee, mid, impact) = quote(false, amountIn);
        if (amountOut < minOut) revert Slippage(amountOut, minOut);
        (uint256 used,) = _bucket();
        bucket = used + amountOut;
        bucketAt = block.timestamp;
        reserve -= amountOut;
        liability -= amountIn;
        IERC20(address(xmxn)).safeTransferFrom(msg.sender, address(this), amountIn);
        xmxn.burn(amountIn);
        ousd.safeTransfer(to, amountOut);
        emit Swapped(msg.sender, to, false, amountIn, amountOut, fee, impact, mid);
    }

    // ---------------------------------------------------------------- equity

    /// @notice Add first-loss OUSD capital: raises the reserve, not the liability. Anyone may add (a gift).
    function addEquity(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        reserve += amount;
        equity += amount;
        ousd.safeTransferFrom(msg.sender, address(this), amount);
        emit EquityAdded(msg.sender, amount);
    }

    /// @notice Owner withdraws surplus only while coverage stays ≥ targetCoverageBps afterwards.
    function withdrawEquity(uint256 amount, address to) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > reserve) revert InsufficientReserve(reserve, amount);
        (uint256 mid,) = fx.price();
        uint256 covAfter = _coverage(reserve - amount, liability, mid);
        if (covAfter < targetCoverageBps) revert CoverageTooLow(covAfter, targetCoverageBps);
        reserve -= amount;
        equity = amount > equity ? 0 : equity - amount;
        ousd.safeTransfer(to, amount);
        emit EquityWithdrawn(to, amount);
    }

    // ---------------------------------------------------------------- owner

    function setParams(
        uint256 feeBps_,
        uint256 depthUsd_,
        uint256 maxSwapUsd_,
        uint256 redeemCapBps_,
        uint256 maxLiability_,
        uint256 stressBps_
    ) external onlyOwner {
        if (feeBps_ > 200 || depthUsd_ == 0 || maxSwapUsd_ == 0 || redeemCapBps_ == 0 || redeemCapBps_ > BPS || stressBps_ > 500) {
            revert InvalidParams();
        }
        (feeBps, depthUsd, maxSwapUsd, redeemCapBps, maxLiability, stressBps) =
            (feeBps_, depthUsd_, maxSwapUsd_, redeemCapBps_, maxLiability_, stressBps_);
        emit ParamsUpdated();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------- internal

    function _coverage(uint256 r, uint256 l, uint256 mid) internal pure returns (uint256) {
        if (l == 0) return type(uint256).max;
        return Math.mulDiv(r, mid * BPS, PX * l);
    }

    function _bucket() internal view returns (uint256 used, uint256 cap) {
        cap = Math.mulDiv(reserve, redeemCapBps, BPS);
        uint256 leaked = Math.mulDiv(cap, block.timestamp - bucketAt, 1 days);
        used = bucket > leaked ? bucket - leaked : 0;
    }

}
