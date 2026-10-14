// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {IFXOracleAdapter} from "./interfaces/IFXOracleAdapter.sol";

/// @title CollateralVault: OUSD-collateralized CDP that mints synthetic xMXN (TESTNET PROTOTYPE)
/// @notice Each user's USD collateral and MXN debt are tracked independently. xMXN is minted only against
///         debt and every repayment burns supply. No admin: parameters are constants, and the token and oracle
///         are immutable.
/// @dev Precision:
///        - collateral (OUSD) and debt (xMXN) are TIP-20 base units, 6 decimals.
///        - oracle `mxnPerUsd` has 8 decimals.
///        - collateral value in xMXN units = collateral * mxnPerUsd / 1e8 (rounded down).
///        - ratios are basis points: ratio = collateralValueMxn * 10_000 / debt.
///      The vault must hold the xMXN TIP-20 ISSUER_ROLE (granted by LocalStableFactory) to mint and burn.
///      Economic note: debt is in pesos and collateral in dollars, so peso appreciation (mxnPerUsd falling)
///      lowers every position's ratio. The oracle is not a peg and gives no liquidity.
contract CollateralVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Position {
        uint256 collateral; // OUSD, 6dp
        uint256 debt; // xMXN, 6dp
    }

    uint256 public constant MIN_MINT_RATIO_BPS = 15_000; // 150%
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 13_500; // 135%
    uint256 public constant LIQUIDATION_PENALTY_BPS = 1_000; // 10% bonus to the liquidator, from collateral
    uint256 internal constant BPS = 10_000;
    uint256 internal constant PRICE_SCALE = 1e8;

    IERC20 public immutable collateralToken;
    ITIP20 public immutable xmxn;
    IFXOracleAdapter public immutable oracle;

    mapping(address => Position) internal _positions;
    uint256 public totalCollateral;
    uint256 public totalDebt;

    event Deposited(address indexed user, uint256 amount);
    event Minted(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized);

    error ZeroAmount();
    error RatioTooLow(uint256 ratioBps, uint256 requiredBps);
    error InsufficientCollateral(uint256 available, uint256 requested);
    error RepayExceedsDebt(uint256 debt, uint256 requested);
    error PositionHealthy(uint256 ratioBps);
    error InvalidOracle();

    constructor(IERC20 collateralToken_, ITIP20 xmxn_, IFXOracleAdapter oracle_) {
        if (oracle_.decimals() != 8) revert InvalidOracle();
        collateralToken = collateralToken_;
        xmxn = xmxn_;
        oracle = oracle_;
    }

    // ---------------------------------------------------------------- user actions

    /// @notice Lock `amount` OUSD (6dp) as collateral. Needs a prior approve.
    function depositCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        _positions[msg.sender].collateral += amount;
        totalCollateral += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Mint `xmxnAmount` (6dp) of new debt to the caller. Reverts on an invalid oracle price or if
    ///         the resulting ratio would be below MIN_MINT_RATIO_BPS.
    function mint(uint256 xmxnAmount) external nonReentrant {
        if (xmxnAmount == 0) revert ZeroAmount();
        Position storage p = _positions[msg.sender];
        uint256 newDebt = p.debt + xmxnAmount;
        (uint256 px,) = oracle.price();
        uint256 ratio = _ratio(p.collateral, newDebt, px);
        if (ratio < MIN_MINT_RATIO_BPS) revert RatioTooLow(ratio, MIN_MINT_RATIO_BPS);
        p.debt = newDebt;
        totalDebt += xmxnAmount;
        xmxn.mint(msg.sender, xmxnAmount);
        emit Minted(msg.sender, xmxnAmount);
    }

    /// @notice Pull `xmxnAmount` from the caller, burn it, and reduce the caller's debt. Works even when the
    ///         oracle is stale or paused, so users can always de-risk. Needs a prior xMXN approve.
    function repayAndBurn(uint256 xmxnAmount) external nonReentrant {
        if (xmxnAmount == 0) revert ZeroAmount();
        Position storage p = _positions[msg.sender];
        if (xmxnAmount > p.debt) revert RepayExceedsDebt(p.debt, xmxnAmount);
        p.debt -= xmxnAmount;
        totalDebt -= xmxnAmount;
        IERC20(address(xmxn)).safeTransferFrom(msg.sender, address(this), xmxnAmount);
        xmxn.burn(xmxnAmount);
        emit Repaid(msg.sender, xmxnAmount);
    }

    /// @notice Withdraw `amount` OUSD. With outstanding debt this needs a valid oracle price, and the
    ///         remaining position must stay at or above MIN_MINT_RATIO_BPS.
    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Position storage p = _positions[msg.sender];
        if (amount > p.collateral) revert InsufficientCollateral(p.collateral, amount);
        uint256 remaining = p.collateral - amount;
        if (p.debt > 0) {
            (uint256 px,) = oracle.price();
            uint256 ratio = _ratio(remaining, p.debt, px);
            if (ratio < MIN_MINT_RATIO_BPS) revert RatioTooLow(ratio, MIN_MINT_RATIO_BPS);
        }
        p.collateral = remaining;
        totalCollateral -= amount;
        collateralToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Repay up to `debtToCover` xMXN of `user`'s debt and seize collateral worth that much plus
    ///         LIQUIDATION_PENALTY_BPS. Only allowed while the position ratio < LIQUIDATION_THRESHOLD_BPS at a
    ///         valid oracle price. Partial liquidations are allowed and there is no close factor. If the
    ///         collateral can't cover debt + bonus, the liquidator receives all remaining collateral.
    /// @dev Demo simplification: below ~110% (1 + penalty) a position is insolvent. Each partial liquidation then
    ///      worsens its ratio, and a capped seize can leave debt with zero collateral (bad debt stays on the
    ///      position; there is no socialization or backstop). Liquidating the full debt clears such a position.
    function liquidate(address user, uint256 debtToCover) external nonReentrant {
        if (debtToCover == 0) revert ZeroAmount();
        Position storage p = _positions[user];
        if (debtToCover > p.debt) revert RepayExceedsDebt(p.debt, debtToCover);
        (uint256 px,) = oracle.price();
        uint256 ratio = _ratio(p.collateral, p.debt, px);
        if (ratio >= LIQUIDATION_THRESHOLD_BPS) revert PositionHealthy(ratio);

        // collateral (6dp OUSD) = debt (6dp xMXN) * 1e8 / mxnPerUsd, plus the penalty bonus
        uint256 seize = Math.mulDiv(debtToCover * (BPS + LIQUIDATION_PENALTY_BPS), PRICE_SCALE, px * BPS);
        if (seize > p.collateral) seize = p.collateral;

        p.debt -= debtToCover;
        p.collateral -= seize;
        totalDebt -= debtToCover;
        totalCollateral -= seize;

        IERC20(address(xmxn)).safeTransferFrom(msg.sender, address(this), debtToCover);
        xmxn.burn(debtToCover);
        collateralToken.safeTransfer(msg.sender, seize);
        emit Liquidated(user, msg.sender, debtToCover, seize);
    }

    // ---------------------------------------------------------------- views

    function getPosition(address user) external view returns (Position memory) {
        return _positions[user];
    }

    /// @notice Ratio in bps at the current oracle price; type(uint256).max if no debt. Reverts if the oracle
    ///         price is invalid and there is debt.
    function collateralRatio(address user) external view returns (uint256) {
        Position memory p = _positions[user];
        if (p.debt == 0) return type(uint256).max;
        (uint256 px,) = oracle.price();
        return _ratio(p.collateral, p.debt, px);
    }

    /// @notice Additional xMXN `user` could mint right now at MIN_MINT_RATIO_BPS (0 if none).
    function maxMintable(address user) external view returns (uint256) {
        Position memory p = _positions[user];
        (uint256 px,) = oracle.price();
        uint256 cap = Math.mulDiv(_value(p.collateral, px), BPS, MIN_MINT_RATIO_BPS);
        return cap > p.debt ? cap - p.debt : 0;
    }

    /// @notice OUSD `user` could withdraw right now without breaking MIN_MINT_RATIO_BPS.
    function maxWithdrawable(address user) external view returns (uint256) {
        Position memory p = _positions[user];
        if (p.debt == 0) return p.collateral;
        (uint256 px,) = oracle.price();
        // Mirror withdrawCollateral's two-step rounding exactly: the ratio check passes iff
        // floor(c * px / 1e8) >= ceil(debt * MIN_RATIO / BPS), i.e. c >= ceil(requiredValue * 1e8 / px).
        uint256 requiredValue = Math.mulDiv(p.debt, MIN_MINT_RATIO_BPS, BPS, Math.Rounding.Ceil);
        uint256 required = Math.mulDiv(requiredValue, PRICE_SCALE, px, Math.Rounding.Ceil);
        return p.collateral > required ? p.collateral - required : 0;
    }

    /// @notice True if `user` can be liquidated at the current oracle price.
    function isLiquidatable(address user) external view returns (bool) {
        Position memory p = _positions[user];
        if (p.debt == 0) return false;
        (uint256 px,) = oracle.price();
        return _ratio(p.collateral, p.debt, px) < LIQUIDATION_THRESHOLD_BPS;
    }

    // ---------------------------------------------------------------- internal math

    /// @dev OUSD (6dp) -> xMXN (6dp) at an 8dp price, rounded down.
    function _value(uint256 collateral, uint256 px) internal pure returns (uint256) {
        return Math.mulDiv(collateral, px, PRICE_SCALE);
    }

    function _ratio(uint256 collateral, uint256 debt, uint256 px) internal pure returns (uint256) {
        if (debt == 0) return type(uint256).max;
        return Math.mulDiv(_value(collateral, px), BPS, debt);
    }
}
