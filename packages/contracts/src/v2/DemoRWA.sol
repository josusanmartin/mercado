// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title DemoRWA: a DEMO tokenized real-world asset for testnet (e.g. "tTBILL"). NOT a security, no backing.
/// @notice Anyone can take a capped amount from `faucet` so demo institutions can post it as collateral.
///         Its USD price comes from an admin AdminPriceFeed, never from this contract.
contract DemoRWA is ERC20, Ownable2Step {
    uint256 public immutable faucetCap;

    constructor(string memory name_, string memory symbol_, address owner_, uint256 faucetCap_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        faucetCap = faucetCap_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Demo faucet: mint up to `faucetCap` per call to the caller.
    function faucet(uint256 amount) external {
        require(amount > 0 && amount <= faucetCap, "faucet cap");
        _mint(msg.sender, amount);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
