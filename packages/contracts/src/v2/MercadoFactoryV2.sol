// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20Factory} from "tempo-std/interfaces/ITIP20Factory.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";

/// @title MercadoFactoryV2: creates xMXN v2 through Tempo's TIP20Factory and grants ISSUER_ROLE exactly once,
///        to the CREATE vault and the MOVE AMM, then locks. This factory keeps the token's DEFAULT_ADMIN_ROLE
///        but has no other role-granting path, so the issuer set is fixed for the token's lifetime.
contract MercadoFactoryV2 is Ownable2Step {
    ITIP20Factory public constant TIP20_FACTORY = ITIP20Factory(0x20Fc000000000000000000000000000000000000);

    address public token;
    address public vault;
    address public amm;
    bool public locked;

    event TokenCreated(address token);
    event IssuersLocked(address vault, address amm);

    error AlreadyCreated();
    error NotCreated();
    error Locked();

    constructor(address owner_) Ownable(owner_) {}

    function createToken(string calldata name, string calldata symbol, string calldata currency, ITIP20 quoteToken, bytes32 salt)
        external
        onlyOwner
        returns (address)
    {
        if (token != address(0)) revert AlreadyCreated();
        token = TIP20_FACTORY.createToken(name, symbol, currency, quoteToken, address(this), salt);
        emit TokenCreated(token);
        return token;
    }

    /// @notice One-shot: grant ISSUER_ROLE to the vault and the AMM, then lock forever.
    function lockIssuers(address vault_, address amm_) external onlyOwner {
        if (token == address(0)) revert NotCreated();
        if (locked) revert Locked();
        locked = true;
        (vault, amm) = (vault_, amm_);
        bytes32 issuer = ITIP20(token).ISSUER_ROLE();
        ITIP20RolesAuth(token).grantRole(issuer, vault_);
        ITIP20RolesAuth(token).grantRole(issuer, amm_);
        emit IssuersLocked(vault_, amm_);
    }
}
