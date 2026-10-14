// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPriceFeed} from "./IPriceFeed.sol";

/// @title FixedPriceFeed: constant USD price (testnet: OUSD assumed at $1.00, labeled as an assumption)
contract FixedPriceFeed is IPriceFeed {
    uint256 public immutable px;
    string public label;

    constructor(uint256 px8, string memory label_) {
        require(px8 > 0, "px");
        px = px8;
        label = label_;
    }

    function price() external view returns (uint256, uint256) {
        return (px, block.timestamp);
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }
}
