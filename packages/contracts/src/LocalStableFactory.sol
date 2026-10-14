// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20Factory} from "tempo-std/interfaces/ITIP20Factory.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {IFXOracleAdapter} from "./interfaces/IFXOracleAdapter.sol";
import {CollateralVault} from "./CollateralVault.sol";

/// @title LocalStableFactory: creates synthetic local-currency markets (xMXN today)
/// @notice Creates the debt token through Tempo's native TIP20Factory precompile, deploys its
///         CollateralVault and grants that vault the TIP-20 ISSUER_ROLE. Minimal admin: this factory keeps the
///         token's DEFAULT_ADMIN_ROLE but exposes no function that grants roles, so the vault is the only issuer
///         for the token's lifetime. The registry is keyed by currency code, ready for future currencies.
contract LocalStableFactory is Ownable2Step {
    ITIP20Factory public constant TIP20_FACTORY = ITIP20Factory(0x20Fc000000000000000000000000000000000000);

    struct Market {
        address token; // synthetic TIP-20 (6dp)
        address vault; // CollateralVault, sole ISSUER_ROLE holder
        address oracle; // FX feed: local currency per USD, 8dp
        address collateral; // USD TIP-20 collateral (6dp)
    }

    mapping(bytes32 currencyKey => Market) internal _markets;
    string[] internal _currencies;

    event MarketCreated(string currency, address indexed token, address indexed vault, address oracle, address collateral);

    error MarketExists(string currency);
    error UnknownMarket(string currency);

    constructor(address owner_) Ownable(owner_) {}

    /// @notice Create a synthetic market. `quoteToken` must be an existing TIP-20 (e.g. pathUSD).
    function createMarket(
        string calldata name,
        string calldata symbol,
        string calldata currency,
        ITIP20 quoteToken,
        IERC20 collateral,
        IFXOracleAdapter oracle,
        bytes32 salt
    ) external onlyOwner returns (address token, address vault) {
        bytes32 key = keccak256(bytes(currency));
        if (_markets[key].token != address(0)) revert MarketExists(currency);

        token = TIP20_FACTORY.createToken(name, symbol, currency, quoteToken, address(this), salt);
        vault = address(new CollateralVault(collateral, ITIP20(token), oracle));
        ITIP20RolesAuth(token).grantRole(ITIP20(token).ISSUER_ROLE(), vault);

        _markets[key] = Market(token, vault, address(oracle), address(collateral));
        _currencies.push(currency);
        emit MarketCreated(currency, token, vault, address(oracle), address(collateral));
    }

    function getMarket(string calldata currency) external view returns (Market memory m) {
        m = _markets[keccak256(bytes(currency))];
        if (m.token == address(0)) revert UnknownMarket(currency);
    }

    function currencies() external view returns (string[] memory) {
        return _currencies;
    }
}
