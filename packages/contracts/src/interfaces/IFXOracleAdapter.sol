// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice FX feed for MXN per USD.
/// @dev Precision: `mxnPerUsd` has 8 decimals (20.00 MXN/USD = 2_000_000_000). `updatedAt` is unix seconds.
interface IFXOracleAdapter {
    event PriceUpdated(uint256 mxnPerUsd, uint256 updatedAt);

    /// @notice Reverts if zero, stale (> maxAge), out of the sanity band, or paused.
    function price() external view returns (uint256 mxnPerUsd, uint256 updatedAt);
    function decimals() external pure returns (uint8);
    function maxAge() external view returns (uint256);
    /// @notice true for the admin-controlled testnet feed. UIs must label it as a mock.
    function isMock() external view returns (bool);
}
