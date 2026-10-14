// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPriceFeed} from "./IPriceFeed.sol";

/// @title ERC4626PriceFeed: USD price of one vault share = convertToAssets(1 share) × underlying USD price
/// @dev Safe only for vaults whose share price can't be moved within a block (StakedOUSD's totalAssets is
///      accrual-based, not balance-based, so donations don't move it).
contract ERC4626PriceFeed is IPriceFeed {
    IERC4626 public immutable vault;
    IPriceFeed public immutable underlyingFeed;
    uint256 internal immutable oneShare;
    uint256 internal immutable oneAsset;

    constructor(IERC4626 vault_, IPriceFeed underlyingFeed_) {
        vault = vault_;
        underlyingFeed = underlyingFeed_;
        oneShare = 10 ** IERC20Metadata(address(vault_)).decimals();
        oneAsset = 10 ** IERC20Metadata(vault_.asset()).decimals();
    }

    function price() external view returns (uint256, uint256) {
        (uint256 u, uint256 at) = underlyingFeed.price();
        return (Math.mulDiv(vault.convertToAssets(oneShare), u, oneAsset), at);
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }
}
