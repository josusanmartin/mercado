// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IPriceFeed} from "./IPriceFeed.sol";

/// @title AdminPriceFeed: admin-set USD price for a DEMO asset (testnet). Not a market price.
/// @dev 8dp. price() reverts when paused, zero, stale (> maxAge) or outside [minPrice, maxPrice].
///      setPrice enforces the band and a max jump vs the previous value; forceSet skips the jump (stress demos).
contract AdminPriceFeed is IPriceFeed, Ownable2Step {
    uint256 internal constant BPS = 10_000;
    string public label;
    uint256 public px;
    uint256 public updatedAt;
    uint256 public immutable maxAge;
    uint256 public immutable minPrice;
    uint256 public immutable maxPrice;
    uint256 public immutable maxJumpBps;
    bool public paused;

    error FeedPaused();
    error InvalidPrice();
    error StalePrice(uint256 updatedAt, uint256 maxAge);
    error PriceOutOfBand(uint256 price, uint256 minPrice, uint256 maxPrice);
    error PriceJumpTooLarge(uint256 previous, uint256 next, uint256 maxJumpBps);

    event PriceUpdated(uint256 px8, uint256 updatedAt);
    event Paused(bool paused);

    constructor(
        address owner_,
        string memory label_,
        uint256 initialPrice,
        uint256 maxAge_,
        uint256 minPrice_,
        uint256 maxPrice_,
        uint256 maxJumpBps_
    ) Ownable(owner_) {
        require(maxAge_ > 0 && minPrice_ > 0 && minPrice_ < maxPrice_ && maxJumpBps_ > 0 && maxJumpBps_ <= BPS, "config");
        label = label_;
        maxAge = maxAge_;
        minPrice = minPrice_;
        maxPrice = maxPrice_;
        maxJumpBps = maxJumpBps_;
        _band(initialPrice);
        _write(initialPrice);
    }

    function price() external view returns (uint256, uint256) {
        if (paused) revert FeedPaused();
        if (block.timestamp - updatedAt > maxAge) revert StalePrice(updatedAt, maxAge);
        _band(px);
        return (px, updatedAt);
    }

    function peek() external view returns (uint256 px8, uint256 at, bool valid) {
        px8 = px;
        at = updatedAt;
        valid = !paused && block.timestamp - at <= maxAge && px8 >= minPrice && px8 <= maxPrice;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function setPrice(uint256 p) external onlyOwner {
        _band(p);
        uint256 diff = p > px ? p - px : px - p;
        if (diff * BPS > px * maxJumpBps) revert PriceJumpTooLarge(px, p, maxJumpBps);
        _write(p);
    }

    function forceSet(uint256 p) external onlyOwner {
        _band(p);
        _write(p);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    function _band(uint256 p) internal view {
        if (p == 0) revert InvalidPrice();
        if (p < minPrice || p > maxPrice) revert PriceOutOfBand(p, minPrice, maxPrice);
    }

    function _write(uint256 p) internal {
        px = p;
        updatedAt = block.timestamp;
        emit PriceUpdated(p, block.timestamp);
    }
}
