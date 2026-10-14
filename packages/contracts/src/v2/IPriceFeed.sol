// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice USD price of one whole collateral unit, 8 decimals. Reverts when the price must not be used.
///         Same shape as the v1 FXOracleAdapter, which also serves as the MXN-per-USD feed.
interface IPriceFeed {
    function price() external view returns (uint256 px8, uint256 updatedAt);
    function decimals() external view returns (uint8);
}
