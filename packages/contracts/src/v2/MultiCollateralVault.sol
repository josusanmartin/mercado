// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {IPriceFeed} from "./IPriceFeed.sol";

/// @title MultiCollateralVault: CREATE module, mint xMXN against OUSD, demo staked OUSD and demo RWAs (TESTNET)
/// @notice Positions are per (user, collateral) and independent, like Maker vaults per ilk. Each collateral has
///         its own USD feed, mint ratio (1/LTV), liquidation ratio, penalty and debt ceiling. The vault runs no
///         strategy: yield accrues inside yield-bearing collateral (e.g. sOUSD share price) and belongs to the depositor.
/// @dev Units: collateral in its own decimals; xMXN 6dp; USD feeds 8dp; FX (MXN per USD) 8dp; ratios in bps.
///        usd6  = floor(amount × usdPx × 1e6 / (10^dec × 1e8))
///        value = floor(usd6 × fx / 1e8)                       (xMXN, 6dp)
///        ratio = floor(value × 1e4 / debt)
///      Mint/withdraw need ratio ≥ mintRatio; liquidation needs ratio < liqRatio. Repay never needs an oracle.
///      Must hold xMXN ISSUER_ROLE (granted once by MercadoFactoryV2).
contract MultiCollateralVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant PX = 1e8;

    struct CollateralParams {
        IPriceFeed feed;
        uint16 mintRatioBps;
        uint16 liqRatioBps;
        uint16 liqPenaltyBps;
        uint128 debtCeiling;
        bool mintPaused;
    }

    struct Position {
        uint256 collateral;
        uint256 debt;
    }

    struct Totals {
        uint256 collateral;
        uint256 debt;
    }

    ITIP20 public immutable xmxn;
    IPriceFeed public immutable fx; // MXN per USD, 8dp (the v1 FXOracleAdapter)

    mapping(address token => CollateralParams) internal _params;
    mapping(address token => uint256) internal _scale; // 10^decimals
    mapping(address token => Totals) internal _totals;
    mapping(address user => mapping(address token => Position)) internal _positions;
    address[] internal _collaterals;

    event CollateralAdded(address indexed token, address feed, uint256 mintRatioBps, uint256 liqRatioBps, uint256 penaltyBps, uint256 debtCeiling);
    event RiskParamsUpdated(address indexed token, uint256 mintRatioBps, uint256 liqRatioBps, uint256 penaltyBps);
    event DebtCeilingUpdated(address indexed token, uint256 debtCeiling);
    event MintPaused(address indexed token, bool paused);
    event FeedUpdated(address indexed token, address feed);
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Minted(address indexed user, address indexed token, uint256 amount);
    event Repaid(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event Liquidated(address indexed user, address indexed token, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized);

    error ZeroAmount();
    error UnknownCollateral(address token);
    error CollateralExists(address token);
    error InvalidParams();
    error MintingPaused(address token);
    error DebtCeilingExceeded(uint256 debtAfter, uint256 ceiling);
    error RatioTooLow(uint256 ratioBps, uint256 requiredBps);
    error InsufficientCollateral(uint256 available, uint256 requested);
    error RepayExceedsDebt(uint256 debt, uint256 requested);
    error PositionHealthy(uint256 ratioBps);

    constructor(address owner_, ITIP20 xmxn_, IPriceFeed fx_) Ownable(owner_) {
        if (fx_.decimals() != 8) revert InvalidParams();
        xmxn = xmxn_;
        fx = fx_;
    }

    // ---------------------------------------------------------------- admin (production: behind a timelock)

    function addCollateral(
        address token,
        IPriceFeed feed,
        uint16 mintRatioBps,
        uint16 liqRatioBps,
        uint16 penaltyBps,
        uint128 debtCeiling
    ) external onlyOwner {
        if (address(_params[token].feed) != address(0)) revert CollateralExists(token);
        if (feed.decimals() != 8) revert InvalidParams();
        _checkRisk(mintRatioBps, liqRatioBps, penaltyBps);
        _params[token] = CollateralParams(feed, mintRatioBps, liqRatioBps, penaltyBps, debtCeiling, false);
        _scale[token] = 10 ** IERC20Metadata(token).decimals();
        _collaterals.push(token);
        emit CollateralAdded(token, address(feed), mintRatioBps, liqRatioBps, penaltyBps, debtCeiling);
    }

    function setRiskParams(address token, uint16 mintRatioBps, uint16 liqRatioBps, uint16 penaltyBps) external onlyOwner {
        CollateralParams storage p = _known(token);
        _checkRisk(mintRatioBps, liqRatioBps, penaltyBps);
        (p.mintRatioBps, p.liqRatioBps, p.liqPenaltyBps) = (mintRatioBps, liqRatioBps, penaltyBps);
        emit RiskParamsUpdated(token, mintRatioBps, liqRatioBps, penaltyBps);
    }

    function setDebtCeiling(address token, uint128 debtCeiling) external onlyOwner {
        _known(token).debtCeiling = debtCeiling;
        emit DebtCeilingUpdated(token, debtCeiling);
    }

    /// @notice Circuit breaker: blocks new minting only. Repay, withdraw and liquidation keep working.
    function setMintPaused(address token, bool paused) external onlyOwner {
        _known(token).mintPaused = paused;
        emit MintPaused(token, paused);
    }

    function setFeed(address token, IPriceFeed feed) external onlyOwner {
        if (feed.decimals() != 8) revert InvalidParams();
        _known(token).feed = feed;
        emit FeedUpdated(token, address(feed));
    }

    /// @dev liquidation at the threshold must stay solvent: liqRatio ≥ 100% + penalty + 1%; mint > liq + 10%.
    function _checkRisk(uint256 mintR, uint256 liqR, uint256 pen) internal pure {
        if (pen == 0 || pen > 2_500 || liqR < BPS + pen + 100 || mintR < liqR + 1_000 || mintR > 100_000) {
            revert InvalidParams();
        }
    }

    // ---------------------------------------------------------------- user actions

    function depositCollateral(address token, uint256 amount) external nonReentrant {
        _known(token);
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _positions[msg.sender][token].collateral += amount;
        _totals[token].collateral += amount;
        emit Deposited(msg.sender, token, amount);
    }

    function mint(address token, uint256 amount) external nonReentrant {
        CollateralParams storage p = _known(token);
        if (amount == 0) revert ZeroAmount();
        if (p.mintPaused) revert MintingPaused(token);
        Totals storage t = _totals[token];
        if (t.debt + amount > p.debtCeiling) revert DebtCeilingExceeded(t.debt + amount, p.debtCeiling);
        Position storage pos = _positions[msg.sender][token];
        uint256 newDebt = pos.debt + amount;
        uint256 ratio = _ratio(token, p, pos.collateral, newDebt);
        if (ratio < p.mintRatioBps) revert RatioTooLow(ratio, p.mintRatioBps);
        pos.debt = newDebt;
        t.debt += amount;
        xmxn.mint(msg.sender, amount);
        emit Minted(msg.sender, token, amount);
    }

    function repayAndBurn(address token, uint256 amount) external nonReentrant {
        _known(token);
        if (amount == 0) revert ZeroAmount();
        Position storage pos = _positions[msg.sender][token];
        if (amount > pos.debt) revert RepayExceedsDebt(pos.debt, amount);
        pos.debt -= amount;
        _totals[token].debt -= amount;
        IERC20(address(xmxn)).safeTransferFrom(msg.sender, address(this), amount);
        xmxn.burn(amount);
        emit Repaid(msg.sender, token, amount);
    }

    function withdrawCollateral(address token, uint256 amount) external nonReentrant {
        CollateralParams storage p = _known(token);
        if (amount == 0) revert ZeroAmount();
        Position storage pos = _positions[msg.sender][token];
        if (amount > pos.collateral) revert InsufficientCollateral(pos.collateral, amount);
        uint256 remaining = pos.collateral - amount;
        if (pos.debt > 0) {
            uint256 ratio = _ratio(token, p, remaining, pos.debt);
            if (ratio < p.mintRatioBps) revert RatioTooLow(ratio, p.mintRatioBps);
        }
        pos.collateral = remaining;
        _totals[token].collateral -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Cover up to `debtToCover` of `user`'s debt on `token` and seize that much collateral value plus the
    ///         collateral's penalty. Only below liqRatio at valid prices. If the collateral can't cover debt +
    ///         penalty the liquidator gets all of it (bad debt stays on the position; no backstop on testnet).
    function liquidate(address user, address token, uint256 debtToCover) external nonReentrant {
        CollateralParams storage p = _known(token);
        if (debtToCover == 0) revert ZeroAmount();
        Position storage pos = _positions[user][token];
        if (debtToCover > pos.debt) revert RepayExceedsDebt(pos.debt, debtToCover);
        (uint256 usdPx, uint256 fxPx) = _prices(p);
        uint256 ratio = _ratioAt(token, pos.collateral, pos.debt, usdPx, fxPx);
        if (ratio >= p.liqRatioBps) revert PositionHealthy(ratio);

        // xMXN → USD (6dp) → collateral units, with the penalty bonus; rounded down
        uint256 usd6 = Math.mulDiv(debtToCover * (BPS + p.liqPenaltyBps), PX, fxPx * BPS);
        uint256 seize = Math.mulDiv(usd6, _scale[token] * PX, usdPx * 1e6);
        if (seize > pos.collateral) seize = pos.collateral;

        pos.debt -= debtToCover;
        pos.collateral -= seize;
        _totals[token].debt -= debtToCover;
        _totals[token].collateral -= seize;
        IERC20(address(xmxn)).safeTransferFrom(msg.sender, address(this), debtToCover);
        xmxn.burn(debtToCover);
        IERC20(token).safeTransfer(msg.sender, seize);
        emit Liquidated(user, token, msg.sender, debtToCover, seize);
    }

    // ---------------------------------------------------------------- views

    function collaterals() external view returns (address[] memory) {
        return _collaterals;
    }

    function params(address token) external view returns (CollateralParams memory) {
        return _params[token];
    }

    function totals(address token) external view returns (uint256 collateral, uint256 debt) {
        Totals memory t = _totals[token];
        return (t.collateral, t.debt);
    }

    function getPosition(address user, address token) external view returns (uint256 collateral, uint256 debt) {
        Position memory pos = _positions[user][token];
        return (pos.collateral, pos.debt);
    }

    /// @notice xMXN value (6dp) of `amount` of `token` at current prices. Reverts on invalid prices.
    function collateralValue(address token, uint256 amount) external view returns (uint256) {
        CollateralParams storage p = _known(token);
        (uint256 usdPx, uint256 fxPx) = _prices(p);
        return _value(token, amount, usdPx, fxPx);
    }

    function collateralRatio(address user, address token) external view returns (uint256) {
        CollateralParams storage p = _known(token);
        Position memory pos = _positions[user][token];
        if (pos.debt == 0) return type(uint256).max;
        return _ratio(token, p, pos.collateral, pos.debt);
    }

    function maxMintable(address user, address token) external view returns (uint256) {
        CollateralParams storage p = _known(token);
        Position memory pos = _positions[user][token];
        (uint256 usdPx, uint256 fxPx) = _prices(p);
        uint256 cap = Math.mulDiv(_value(token, pos.collateral, usdPx, fxPx), BPS, p.mintRatioBps);
        uint256 room = cap > pos.debt ? cap - pos.debt : 0;
        uint256 t = _totals[token].debt;
        uint256 ceilingRoom = p.debtCeiling > t ? p.debtCeiling - t : 0;
        if (p.mintPaused) return 0;
        return room < ceilingRoom ? room : ceilingRoom;
    }

    /// @notice Exact: withdrawing this much always passes, one unit more fails (mirrors the two-step rounding).
    function maxWithdrawable(address user, address token) external view returns (uint256) {
        CollateralParams storage p = _known(token);
        Position memory pos = _positions[user][token];
        if (pos.debt == 0) return pos.collateral;
        (uint256 usdPx, uint256 fxPx) = _prices(p);
        // need floor(floor(c·a/b)·fx/1e8) ≥ V := ceil(debt·mintRatio/1e4)
        uint256 v = Math.mulDiv(pos.debt, p.mintRatioBps, BPS, Math.Rounding.Ceil);
        uint256 u = Math.mulDiv(v, PX, fxPx, Math.Rounding.Ceil); // usd6 needed
        uint256 required = Math.mulDiv(u, _scale[token] * PX, usdPx * 1e6, Math.Rounding.Ceil);
        return pos.collateral > required ? pos.collateral - required : 0;
    }

    function isLiquidatable(address user, address token) external view returns (bool) {
        CollateralParams storage p = _known(token);
        Position memory pos = _positions[user][token];
        if (pos.debt == 0) return false;
        return _ratio(token, p, pos.collateral, pos.debt) < p.liqRatioBps;
    }

    // ---------------------------------------------------------------- internal math

    function _known(address token) internal view returns (CollateralParams storage p) {
        p = _params[token];
        if (address(p.feed) == address(0)) revert UnknownCollateral(token);
    }

    function _prices(CollateralParams storage p) internal view returns (uint256 usdPx, uint256 fxPx) {
        (usdPx,) = p.feed.price();
        (fxPx,) = fx.price();
    }

    function _value(address token, uint256 amount, uint256 usdPx, uint256 fxPx) internal view returns (uint256) {
        uint256 usd6 = Math.mulDiv(amount, usdPx * 1e6, _scale[token] * PX);
        return Math.mulDiv(usd6, fxPx, PX);
    }

    function _ratioAt(address token, uint256 coll, uint256 debt, uint256 usdPx, uint256 fxPx) internal view returns (uint256) {
        if (debt == 0) return type(uint256).max;
        return Math.mulDiv(_value(token, coll, usdPx, fxPx), BPS, debt);
    }

    function _ratio(address token, CollateralParams storage p, uint256 coll, uint256 debt) internal view returns (uint256) {
        (uint256 usdPx, uint256 fxPx) = _prices(p);
        return _ratioAt(token, coll, debt, usdPx, fxPx);
    }
}
