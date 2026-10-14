// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Base} from "./utils/Base.t.sol";
import {FXOracleAdapter} from "../src/FXOracleAdapter.sol";
import {CollateralVault} from "../src/CollateralVault.sol";

/// Oracle safety rails and peso-appreciation stress. Local, real TIP-20 precompiles (network = "tempo").
/// Note: prices are uint256, so a "negative" price is unrepresentable; zero and outliers are covered below.
contract FXStressTest is Base {
    // ------------------------------------------------------------ oracle rails

    function test_oracleBasics() public view {
        (uint256 px, uint256 at) = oracle.price();
        assertEq(px, PX_20);
        assertEq(at, block.timestamp);
        assertEq(oracle.decimals(), 8);
        assertEq(oracle.maxAge(), 3600);
        assertTrue(oracle.isMock());
    }

    function test_stalePriceReverts() public {
        vm.warp(block.timestamp + 3601);
        vm.expectRevert(abi.encodeWithSelector(FXOracleAdapter.StalePrice.selector, block.timestamp - 3601, 3600));
        oracle.price();
        (,, bool valid) = oracle.peek();
        assertFalse(valid);
    }

    function test_zeroPriceRejected() public {
        vm.prank(admin);
        vm.expectRevert(FXOracleAdapter.InvalidPrice.selector);
        oracle.setPrice(0);
        vm.prank(admin);
        vm.expectRevert(FXOracleAdapter.InvalidPrice.selector);
        oracle.forceSet(0);
        vm.expectRevert(FXOracleAdapter.InvalidPrice.selector);
        new FXOracleAdapter(admin, 0);
    }

    function test_outOfBandRejected() public {
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(FXOracleAdapter.PriceOutOfBand.selector, 4e8, 5e8, 50e8));
        oracle.forceSet(4e8);
        vm.expectRevert(abi.encodeWithSelector(FXOracleAdapter.PriceOutOfBand.selector, 51e8, 5e8, 50e8));
        oracle.forceSet(51e8);
        vm.stopPrank();
    }

    function test_outlierJumpRejected() public {
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(FXOracleAdapter.PriceJumpTooLarge.selector, 20e8, 15e8, 2000));
        oracle.setPrice(15e8); // -25%
        vm.expectRevert();
        oracle.setPrice(24_000_000_01); // +20.00000005%
        oracle.setPrice(24e8); // exactly +20% ok
        oracle.setPrice(19_2e7); // -20% ok
        vm.stopPrank();
    }

    function test_bandShrinkMakesStoredPriceInvalid() public {
        vm.prank(admin);
        oracle.setConfig(3600, 21e8, 50e8, 2000); // stored 20.00 now outside band
        vm.expectRevert();
        oracle.price();
    }

    function test_onlyOwnerCanPush() public {
        vm.startPrank(alice);
        vm.expectRevert();
        oracle.setPrice(21e8);
        vm.expectRevert();
        oracle.forceSet(21e8);
        vm.expectRevert();
        oracle.pause();
        vm.stopPrank();
    }

    function test_pausedReverts() public {
        vm.prank(admin);
        oracle.pause();
        vm.expectRevert(FXOracleAdapter.OraclePaused.selector);
        oracle.price();
    }

    // ------------------------------------------------------------ vault uses only valid prices

    function test_staleBlocksMintWithdrawLiquidate() public {
        _open(alice, 1_000e6, 13_000e6);
        vm.warp(block.timestamp + 2 hours);
        vm.startPrank(alice);
        vm.expectRevert();
        vault.mint(1e6);
        vm.expectRevert();
        vault.withdrawCollateral(1e6);
        vm.stopPrank();
        vm.prank(liquidator);
        vm.expectRevert();
        vault.liquidate(alice, 1e6);
    }

    function test_pausedBlocksMintAndLiquidate() public {
        _open(alice, 1_000e6, 13_000e6);
        vm.prank(admin);
        oracle.pause();
        vm.prank(alice);
        vm.expectRevert(FXOracleAdapter.OraclePaused.selector);
        vault.mint(1e6);
        vm.prank(liquidator);
        vm.expectRevert(FXOracleAdapter.OraclePaused.selector);
        vault.liquidate(alice, 1e6);
    }

    // ------------------------------------------------------------ peso appreciation stress

    /// 1,000 OUSD / 10,000 xMXN at 20 = 200%. The peso appreciates to 13 MXN/USD → 130% < 135%.
    function test_pesoAppreciationMakesLiquidationEnforceable() public {
        _open(alice, 1_000e6, 10_000e6);
        assertEq(vault.collateralRatio(alice), 20_000);
        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.PositionHealthy.selector, 20_000));
        vault.liquidate(alice, 1_000e6);

        // stepwise moves within the 20% jump limit: 20 → 16.5 → 13.5 → 13
        vm.startPrank(admin);
        oracle.setPrice(16_5e7);
        assertEq(vault.collateralRatio(alice), 16_500);
        oracle.setPrice(13_5e7);
        assertEq(vault.collateralRatio(alice), 13_500); // exactly at threshold: not yet liquidatable
        assertFalse(vault.isLiquidatable(alice));
        oracle.setPrice(13e8);
        vm.stopPrank();
        assertEq(vault.collateralRatio(alice), 13_000);
        assertTrue(vault.isLiquidatable(alice));

        // the user can no longer mint or withdraw
        vm.startPrank(alice);
        vm.expectRevert();
        vault.mint(1);
        vm.expectRevert();
        vault.withdrawCollateral(1);
        vm.stopPrank();

        // liquidator buys xMXN from a healthy position and covers 5,000 xMXN of debt
        _open(liquidator, 2_000e6, 5_000e6);
        uint256 supplyBefore = xmxn.totalSupply();
        uint256 ousdBefore = ousd.balanceOf(liquidator);
        vm.startPrank(liquidator);
        xmxn.approve(address(vault), 5_000e6);
        vault.liquidate(alice, 5_000e6);
        vm.stopPrank();

        // seized = 5,000 * 1.1 / 13 = 423.076923 OUSD
        uint256 seized = ousd.balanceOf(liquidator) - ousdBefore;
        assertEq(seized, 423_076_923);
        assertEq(xmxn.totalSupply(), supplyBefore - 5_000e6, "liquidation burns covered debt");
        CollateralVault.Position memory p = vault.getPosition(alice);
        assertEq(p.debt, 5_000e6);
        assertEq(p.collateral, 1_000e6 - seized);
        assertGt(vault.collateralRatio(alice), 13_000, "partial liquidation above 110% improves health");
    }

    /// Stress demo scenario (StressDemo.s.sol): a 160% position at 20, forceSet to 13 (104%), full liquidation.
    function test_forceSetStressAndFullLiquidation() public {
        _open(alice, 100e6, 1_250e6);
        assertEq(vault.collateralRatio(alice), 16_000);
        vm.prank(admin);
        oracle.forceSet(13e8); // -35% in one step: only possible via forceSet
        assertEq(vault.collateralRatio(alice), 10_400);

        _open(liquidator, 1_000e6, 1_250e6);
        vm.startPrank(liquidator);
        xmxn.approve(address(vault), 1_250e6);
        vault.liquidate(alice, 1_250e6);
        vm.stopPrank();
        CollateralVault.Position memory p = vault.getPosition(alice);
        assertEq(p.debt, 0);
        assertEq(p.collateral, 0, "insolvent: liquidator takes all collateral");

        vm.prank(admin);
        oracle.forceSet(PX_20); // restore
        (uint256 px,) = oracle.price();
        assertEq(px, PX_20);
    }

    function test_cannotLiquidateMoreThanDebt() public {
        _open(alice, 1_000e6, 10_000e6);
        vm.prank(admin);
        oracle.forceSet(13e8);
        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.RepayExceedsDebt.selector, 10_000e6, 10_001e6));
        vault.liquidate(alice, 10_001e6);
    }

    function testFuzz_appreciationLowersRatio(uint256 px) public {
        px = bound(px, 5e8, 20e8 - 1);
        _open(alice, 1_000e6, 10_000e6);
        vm.prank(admin);
        oracle.forceSet(px);
        assertLt(vault.collateralRatio(alice), 20_000);
        assertEq(vault.isLiquidatable(alice), vault.collateralRatio(alice) < 13_500);
    }
}
