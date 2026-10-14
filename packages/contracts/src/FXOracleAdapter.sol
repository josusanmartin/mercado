// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IFXOracleAdapter} from "./interfaces/IFXOracleAdapter.sol";

/// @title FXOracleAdapter: admin-controlled MXN/USD mock feed (TESTNET ONLY)
/// @notice No verified USD/MXN feed is known to exist on Tempo Moderato. This adapter is an admin mock
///         feed and `isMock()` returns true. It is NOT a market price and does not peg anything.
/// @dev Precision: `mxnPerUsd` has 8 decimals (20.00 MXN/USD = 2_000_000_000). `updatedAt` is unix seconds.
///      Safety rails enforced on read (`price()`):
///        - paused            -> revert OraclePaused
///        - zero / never set  -> revert InvalidPrice
///        - older than maxAge -> revert StalePrice
///        - outside [minPrice, maxPrice] sanity band -> revert PriceOutOfBand
///      Safety rails enforced on write (`setPrice`): sanity band, plus a max jump of `maxJumpBps` vs the
///      previous value. `forceSet` skips only the jump check (FX stress demo) and still enforces the band.
contract FXOracleAdapter is IFXOracleAdapter, Ownable2Step {
    uint8 public constant DECIMALS = 8;
    uint256 internal constant BPS = 10_000;

    uint256 public mxnPerUsd;
    uint256 public updatedAt;
    uint256 public maxAge;
    uint256 public minPrice;
    uint256 public maxPrice;
    uint256 public maxJumpBps;
    bool public paused;

    error OraclePaused();
    error InvalidPrice();
    error StalePrice(uint256 updatedAt, uint256 maxAge);
    error PriceOutOfBand(uint256 price, uint256 minPrice, uint256 maxPrice);
    error PriceJumpTooLarge(uint256 previous, uint256 next, uint256 maxJumpBps);
    error InvalidConfig();

    event Paused(bool paused);
    event ConfigUpdated(uint256 maxAge, uint256 minPrice, uint256 maxPrice, uint256 maxJumpBps);

    /// @param owner_ admin allowed to push prices
    /// @param initialPrice 8dp MXN per USD; must be inside the band
    constructor(address owner_, uint256 initialPrice) Ownable(owner_) {
        _setConfig(3600, 5e8, 50e8, 2000); // 1h, 5.00–50.00 MXN/USD, 20% max jump
        _checkBand(initialPrice);
        _write(initialPrice);
    }

    // ---------------------------------------------------------------- reads

    /// @inheritdoc IFXOracleAdapter
    function price() external view returns (uint256, uint256) {
        if (paused) revert OraclePaused();
        uint256 p = mxnPerUsd;
        if (p == 0 || updatedAt == 0) revert InvalidPrice();
        if (block.timestamp - updatedAt > maxAge) revert StalePrice(updatedAt, maxAge);
        _checkBand(p);
        return (p, updatedAt);
    }

    /// @notice Raw feed state that never reverts, for UIs that need to display why `price()` fails.
    /// @return mxnPerUsd_ last pushed value (8dp)
    /// @return updatedAt_ when it was pushed
    /// @return valid whether `price()` would succeed right now
    function peek() external view returns (uint256 mxnPerUsd_, uint256 updatedAt_, bool valid) {
        mxnPerUsd_ = mxnPerUsd;
        updatedAt_ = updatedAt;
        valid = !paused && mxnPerUsd_ != 0 && updatedAt_ != 0 && block.timestamp - updatedAt_ <= maxAge
            && mxnPerUsd_ >= minPrice && mxnPerUsd_ <= maxPrice;
    }

    function decimals() external pure returns (uint8) {
        return DECIMALS;
    }

    function isMock() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------- admin

    /// @notice Push a new price (8dp). Enforces the sanity band and the max jump vs the previous value.
    function setPrice(uint256 newPrice) external onlyOwner {
        _checkBand(newPrice);
        uint256 prev = mxnPerUsd;
        uint256 diff = newPrice > prev ? newPrice - prev : prev - newPrice;
        if (diff * BPS > prev * maxJumpBps) revert PriceJumpTooLarge(prev, newPrice, maxJumpBps);
        _write(newPrice);
    }

    /// @notice Stress-mode push: skips the jump check (FX stress demo), still enforces the sanity band.
    function forceSet(uint256 newPrice) external onlyOwner {
        _checkBand(newPrice);
        _write(newPrice);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(true);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Paused(false);
    }

    function setConfig(uint256 maxAge_, uint256 minPrice_, uint256 maxPrice_, uint256 maxJumpBps_)
        external
        onlyOwner
    {
        _setConfig(maxAge_, minPrice_, maxPrice_, maxJumpBps_);
    }

    // ---------------------------------------------------------------- internal

    function _write(uint256 p) internal {
        mxnPerUsd = p;
        updatedAt = block.timestamp;
        emit PriceUpdated(p, block.timestamp);
    }

    function _checkBand(uint256 p) internal view {
        if (p == 0) revert InvalidPrice();
        if (p < minPrice || p > maxPrice) revert PriceOutOfBand(p, minPrice, maxPrice);
    }

    function _setConfig(uint256 maxAge_, uint256 minPrice_, uint256 maxPrice_, uint256 maxJumpBps_) internal {
        if (maxAge_ == 0 || minPrice_ == 0 || minPrice_ >= maxPrice_ || maxJumpBps_ == 0 || maxJumpBps_ > BPS) {
            revert InvalidConfig();
        }
        maxAge = maxAge_;
        minPrice = minPrice_;
        maxPrice = maxPrice_;
        maxJumpBps = maxJumpBps_;
        emit ConfigUpdated(maxAge_, minPrice_, maxPrice_, maxJumpBps_);
    }
}
