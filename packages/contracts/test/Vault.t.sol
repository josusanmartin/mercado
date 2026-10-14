// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Base} from "./utils/Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {LocalStableFactory} from "../src/LocalStableFactory.sol";

/// Local tests against Tempo's real TIP-20 precompiles (network = "tempo"), no fork needed.
contract VaultTest is Base {
    // ------------------------------------------------------------ factory / roles

    function test_factoryCreatesXmxnWithVaultAsOnlyIssuer() public view {
        assertEq(xmxn.symbol(), "xMXN");
        assertEq(xmxn.currency(), "MXN");
        assertEq(xmxn.decimals(), 6);
        assertTrue(TIP20_FACTORY.isTIP20(address(xmxn)));
        bytes32 issuer = xmxn.ISSUER_ROLE();
        assertTrue(ITIP20RolesAuth(address(xmxn)).hasRole(address(vault), issuer));
        assertFalse(ITIP20RolesAuth(address(xmxn)).hasRole(admin, issuer));
        assertFalse(ITIP20RolesAuth(address(xmxn)).hasRole(address(factory), issuer));
        LocalStableFactory.Market memory m = factory.getMarket("MXN");
        assertEq(m.token, address(xmxn));
        assertEq(m.vault, address(vault));
        assertEq(m.collateral, address(ousd));
    }

    function test_onlyVaultCanMint() public {
        vm.prank(alice);
        vm.expectRevert();
        xmxn.mint(alice, 1e6);
        // the deployer/owner EOA has no issuer power either
        vm.prank(admin);
        vm.expectRevert();
        xmxn.mint(admin, 1e6);
        // nor the factory's owner via the token admin role (held by the factory contract, not the EOA)
        bytes32 issuer = xmxn.ISSUER_ROLE();
        vm.prank(admin);
        vm.expectRevert();
        ITIP20RolesAuth(address(xmxn)).grantRole(issuer, admin);
    }

    function test_onlyVaultCanBurn() public {
        _open(alice, 1_000e6, 1_000e6);
        vm.prank(alice);
        vm.expectRevert();
        xmxn.burn(1e6);
    }

    function test_duplicateMarketReverts() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(LocalStableFactory.MarketExists.selector, "MXN"));
        factory.createMarket("x", "x", "MXN", PATH_USD, IERC20(address(ousd)), oracle, bytes32("other"));
    }

    function test_onlyOwnerCreatesMarket() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.createMarket("x", "x", "COP", PATH_USD, IERC20(address(ousd)), oracle, bytes32("cop"));
    }

    // ------------------------------------------------------------ happy path

    function test_depositMintRepayWithdraw() public {
        _fundOusd(alice, 1_000e6);
        vm.startPrank(alice);
        ousd.approve(address(vault), 1_000e6);
        vault.depositCollateral(1_000e6);
        vault.mint(10_000e6); // 200% at 20 MXN/USD
        assertEq(xmxn.balanceOf(alice), 10_000e6);
        assertEq(xmxn.totalSupply(), 10_000e6);
        assertEq(vault.collateralRatio(alice), 20_000);

        xmxn.approve(address(vault), 10_000e6);
        vault.repayAndBurn(4_000e6);
        assertEq(xmxn.totalSupply(), 6_000e6, "repay burns supply");
        assertEq(vault.getPosition(alice).debt, 6_000e6);

        vault.repayAndBurn(6_000e6);
        assertEq(xmxn.totalSupply(), 0);
        assertEq(vault.collateralRatio(alice), type(uint256).max);
        vault.withdrawCollateral(1_000e6);
        vm.stopPrank();
        assertEq(ousd.balanceOf(alice), 1_000e6);
        assertEq(vault.totalCollateral(), 0);
        assertEq(vault.totalDebt(), 0);
    }

    function test_supplyEqualsTotalDebt() public {
        _open(alice, 1_000e6, 5_000e6);
        _open(bob, 2_000e6, 20_000e6);
        assertEq(xmxn.totalSupply(), vault.totalDebt());
        assertEq(vault.totalDebt(), 25_000e6);
    }

    // ------------------------------------------------------------ mint ratio

    /// SPEC example: 1,000 OUSD x 20 MXN/USD / 1.5 = 13,333.33 xMXN
    function test_specExampleMaxMint() public {
        _open(alice, 1_000e6, 0);
        assertEq(vault.maxMintable(alice), 13_333_333_333);
        vm.prank(alice);
        vault.mint(13_333_333_333);
        assertEq(vault.maxMintable(alice), 0);
    }

    function test_cannotMintAboveRatio() public {
        _open(alice, 1_000e6, 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.RatioTooLow.selector, 14_999, 15_000));
        vault.mint(13_334_000_000);
    }

    function test_cannotMintWithoutCollateral() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.RatioTooLow.selector, 0, 15_000));
        vault.mint(1);
    }

    function test_cumulativeMintsRespectRatio() public {
        _open(alice, 1_000e6, 10_000e6);
        vm.startPrank(alice);
        vault.mint(3_333_333_333);
        vm.expectRevert();
        vault.mint(1_000);
        vm.stopPrank();
    }

    function testFuzz_mintNeverExceedsRatio(uint96 coll, uint96 debt) public {
        coll = uint96(bound(coll, 1e6, 1e15));
        debt = uint96(bound(debt, 1, 1e17));
        _open(alice, coll, 0);
        uint256 max = vault.maxMintable(alice);
        vm.prank(alice);
        if (debt > max) {
            vm.expectRevert();
            vault.mint(debt);
        } else {
            vault.mint(debt);
            assertGe(vault.collateralRatio(alice), 15_000);
        }
    }

    // ------------------------------------------------------------ withdrawals

    function test_withdrawCannotMakeUnhealthy() public {
        _open(alice, 1_000e6, 10_000e6); // 200%
        // 150% needs 750 OUSD → max withdraw 250
        assertEq(vault.maxWithdrawable(alice), 250e6);
        vm.prank(alice);
        vm.expectRevert();
        vault.withdrawCollateral(250e6 + 1);
        vm.prank(alice);
        vault.withdrawCollateral(250e6);
        assertEq(vault.collateralRatio(alice), 15_000);
    }

    function test_cannotWithdrawMoreThanDeposited() public {
        _open(alice, 1_000e6, 0);
        _open(bob, 1_000e6, 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.InsufficientCollateral.selector, 1_000e6, 1_001e6));
        vault.withdrawCollateral(1_001e6);
    }

    function testFuzz_withdrawKeepsHealthy(uint64 debt, uint64 amount) public {
        debt = uint64(bound(debt, 1e6, 13_333e6));
        _open(alice, 1_000e6, debt);
        amount = uint64(bound(amount, 1, 1_000e6));
        uint256 maxW = vault.maxWithdrawable(alice);
        vm.prank(alice);
        if (amount > maxW) {
            vm.expectRevert();
            vault.withdrawCollateral(amount);
        } else {
            vault.withdrawCollateral(amount);
            assertGe(vault.collateralRatio(alice), 15_000);
        }
    }

    // ------------------------------------------------------------ repay edge cases

    function test_cannotRepayMoreThanDebt() public {
        _open(alice, 1_000e6, 1_000e6);
        _open(bob, 1_000e6, 1_000e6);
        vm.prank(bob);
        xmxn.transfer(alice, 1_000e6);
        vm.startPrank(alice);
        xmxn.approve(address(vault), 2_000e6);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.RepayExceedsDebt.selector, 1_000e6, 2_000e6));
        vault.repayAndBurn(2_000e6);
        vm.stopPrank();
    }

    function test_repayWorksWhileOracleStale() public {
        _open(alice, 1_000e6, 1_000e6);
        vm.warp(block.timestamp + 2 days);
        vm.startPrank(alice);
        xmxn.approve(address(vault), 1_000e6);
        vault.repayAndBurn(1_000e6);
        vault.withdrawCollateral(1_000e6); // no debt → no oracle needed
        vm.stopPrank();
    }

    function test_zeroAmountsRevert() public {
        vm.startPrank(alice);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.depositCollateral(0);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.mint(0);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.repayAndBurn(0);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.withdrawCollateral(0);
        vm.stopPrank();
    }
}
