// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {StakedOUSD} from "./StakedOUSD.sol";

/// @title StakedXMXN (sxMXN): peso savings vault. The SAME audited StakedOUSD logic (ERC-4626, fully accounted,
///        donation-proof accrual, owner-set APR ≤ 20%, funded yield reserve), instantiated over xMXN v2.
/// @notice Only the token name and symbol differ. Yield is a configured APR paid from a funded reserve (testnet);
///         it is not lending income and not guaranteed.
contract StakedXMXN is StakedOUSD {
    constructor(IERC20 xmxn, address owner_, uint256 aprBps_) StakedOUSD(xmxn, owner_, aprBps_) {}

    function name() public pure override(ERC20, IERC20Metadata) returns (string memory) {
        return "Mercado peso savings (sxMXN, testnet)";
    }

    function symbol() public pure override(ERC20, IERC20Metadata) returns (string memory) {
        return "sxMXN";
    }
}
