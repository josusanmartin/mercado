// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20Factory} from "tempo-std/interfaces/ITIP20Factory.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {FXOracleAdapter} from "../../src/FXOracleAdapter.sol";
import {CollateralVault} from "../../src/CollateralVault.sol";
import {LocalStableFactory} from "../../src/LocalStableFactory.sol";

/// @dev All tests run with `network = "tempo"` (foundry.toml), so the TIP20Factory and TIP-20 tokens are
///      Tempo's REAL precompiles running in the local EVM, not mocks. The collateral is a locally created
///      USD TIP-20 standing in for the Moderato faucet OUSD (same precompile, same 6dp semantics).
abstract contract Base is Test {
    ITIP20Factory constant TIP20_FACTORY = ITIP20Factory(0x20Fc000000000000000000000000000000000000);
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);

    uint256 constant PX_20 = 20e8; // 20.00 MXN per USD (8dp)

    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address liquidator = makeAddr("liquidator");

    ITIP20 ousd;
    ITIP20 xmxn;
    FXOracleAdapter oracle;
    CollateralVault vault;
    LocalStableFactory factory;

    function setUp() public virtual {
        vm.warp(1_760_000_000);
        vm.startPrank(admin);
        ousd = ITIP20(TIP20_FACTORY.createToken("Test OUSD", "OUSD", "USD", PATH_USD, admin, bytes32("ousd")));
        ITIP20RolesAuth(address(ousd)).grantRole(ousd.ISSUER_ROLE(), admin);
        oracle = new FXOracleAdapter(admin, PX_20);
        factory = new LocalStableFactory(admin);
        (address t, address v) = factory.createMarket(
            "Mercado Synthetic Peso (testnet)", "xMXN", "MXN", PATH_USD, IERC20(address(ousd)), oracle, bytes32("xmxn")
        );
        vm.stopPrank();
        xmxn = ITIP20(t);
        vault = CollateralVault(v);
        vm.label(address(ousd), "OUSD");
        vm.label(t, "xMXN");
        vm.label(v, "Vault");
    }

    function _fundOusd(address to, uint256 amount) internal {
        vm.prank(admin);
        ousd.mint(to, amount);
    }

    /// @dev deposit `coll` OUSD and mint `debt` xMXN as `user`
    function _open(address user, uint256 coll, uint256 debt) internal {
        _fundOusd(user, coll);
        vm.startPrank(user);
        ousd.approve(address(vault), coll);
        vault.depositCollateral(coll);
        if (debt > 0) vault.mint(debt);
        vm.stopPrank();
    }
}
