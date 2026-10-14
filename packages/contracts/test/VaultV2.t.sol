// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseV2} from "./utils/BaseV2.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {MultiCollateralVault} from "../src/v2/MultiCollateralVault.sol";
import {MercadoFactoryV2} from "../src/v2/MercadoFactoryV2.sol";
import {AdminPriceFeed} from "../src/v2/AdminPriceFeed.sol";

/// CREATE: multi-collateral vault. Real TIP-20 precompiles for OUSD/xMXN (network = "tempo").
contract VaultV2Test is BaseV2 {
    function test_issuersFixedToVaultAndAmm() public {
        bytes32 issuer = xmxn.ISSUER_ROLE();
        assertTrue(ITIP20RolesAuth(address(xmxn)).hasRole(address(vault), issuer));
        assertTrue(ITIP20RolesAuth(address(xmxn)).hasRole(address(amm), issuer));
        assertFalse(ITIP20RolesAuth(address(xmxn)).hasRole(admin, issuer));
        vm.prank(admin);
        vm.expectRevert(MercadoFactoryV2.Locked.selector);
        factory.lockIssuers(admin, admin);
        vm.prank(admin);
        vm.expectRevert();
        xmxn.mint(admin, 1);
    }

    function test_collateralList() public view {
        address[] memory c = vault.collaterals();
        assertEq(c.length, 3);
        assertEq(c[2], address(tbill));
        assertEq(vault.params(address(tbill)).mintRatioBps, 20_000);
    }

    function test_ousdPositionMatchesV1Math() public {
        _open(alice, address(ousd), 1_000e6, 0);
        assertEq(vault.maxMintable(alice, address(ousd)), 13_333_333_333); // SPEC example
        vm.prank(alice);
        vault.mint(address(ousd), 10_000e6);
        assertEq(vault.collateralRatio(alice, address(ousd)), 20_000);
        assertEq(xmxn.totalSupply(), 10_000e6);
    }

    /// tTBILL at $100 with a 200% mint ratio: 10 tTBILL = $1,000 = 20,000 MXN → max 10,000 xMXN
    function test_rwaHaircut() public {
        _open(alice, address(tbill), 10e6, 0);
        assertEq(vault.collateralValue(address(tbill), 10e6), 20_000e6);
        assertEq(vault.maxMintable(alice, address(tbill)), 10_000e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MultiCollateralVault.RatioTooLow.selector, 19_998, 20_000));
        vault.mint(address(tbill), 10_001e6);
        vm.prank(alice);
        vault.mint(address(tbill), 10_000e6);
    }

    function test_positionsAreIndependentPerCollateral() public {
        _open(alice, address(ousd), 1_000e6, 13_000e6);
        _open(alice, address(tbill), 100e6, 0);
        // lots of tTBILL doesn't let the OUSD position mint more
        vm.prank(alice);
        vm.expectRevert();
        vault.mint(address(ousd), 1_000e6);
        // and an OUSD shock doesn't touch the tTBILL position
        (uint256 c,) = vault.getPosition(alice, address(tbill));
        assertEq(c, 100e6);
    }

    function test_debtCeiling() public {
        vm.prank(admin);
        vault.setDebtCeiling(address(tbill), 5_000e6);
        _open(alice, address(tbill), 100e6, 0);
        assertEq(vault.maxMintable(alice, address(tbill)), 5_000e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MultiCollateralVault.DebtCeilingExceeded.selector, 5_000e6 + 1, 5_000e6));
        vault.mint(address(tbill), 5_000e6 + 1);
    }

    function test_mintPauseBlocksOnlyMinting() public {
        _open(alice, address(tbill), 100e6, 1_000e6);
        vm.prank(admin);
        vault.setMintPaused(address(tbill), true);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(MultiCollateralVault.MintingPaused.selector, address(tbill)));
        vault.mint(address(tbill), 1e6);
        IERC20(address(xmxn)).approve(address(vault), 1_000e6);
        vault.repayAndBurn(address(tbill), 1_000e6);
        vault.withdrawCollateral(address(tbill), 100e6);
        vm.stopPrank();
    }

    function test_unknownCollateralRejected() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MultiCollateralVault.UnknownCollateral.selector, address(0xBEEF)));
        vault.depositCollateral(address(0xBEEF), 1);
    }

    function test_riskParamInvariants() public {
        vm.startPrank(admin);
        vm.expectRevert(MultiCollateralVault.InvalidParams.selector);
        vault.setRiskParams(address(tbill), 15_000, 10_500, 1_200); // liq below 100% + penalty
        vm.expectRevert(MultiCollateralVault.InvalidParams.selector);
        vault.setRiskParams(address(tbill), 17_500, 17_000, 1_200); // mint too close to liq
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert();
        vault.setDebtCeiling(address(tbill), 1);
    }

    function test_rwaPriceDropMakesLiquidationEnforceable() public {
        _open(alice, address(tbill), 10e6, 10_000e6); // 200%
        vm.prank(admin);
        vm.expectRevert(); // demo RWA feed caps jumps at 2%
        tbillFeed.setPrice(80e8);
        vm.prank(admin);
        tbillFeed.forceSet(80e8); // 160% < 170%
        assertTrue(vault.isLiquidatable(alice, address(tbill)));
        _open(liquidator, address(ousd), 1_000e6, 5_000e6);
        uint256 before = tbill.balanceOf(liquidator);
        vm.startPrank(liquidator);
        IERC20(address(xmxn)).approve(address(vault), 5_000e6);
        vault.liquidate(alice, address(tbill), 5_000e6);
        vm.stopPrank();
        // 5,000 xMXN / 20 = $250 × 1.12 = $280 / $80 = 3.5 tTBILL
        assertEq(tbill.balanceOf(liquidator) - before, 3_500_000);
    }

    function test_staleRwaFeedBlocksMintAndWithdraw() public {
        _open(alice, address(tbill), 10e6, 1_000e6);
        vm.warp(block.timestamp + 1 days + 1);
        fx_refresh();
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(AdminPriceFeed.StalePrice.selector, block.timestamp - 1 days - 1, 1 days));
        vault.mint(address(tbill), 1e6);
        vm.expectRevert();
        vault.withdrawCollateral(address(tbill), 1e6);
        // repay never needs prices
        IERC20(address(xmxn)).approve(address(vault), 1_000e6);
        vault.repayAndBurn(address(tbill), 1_000e6);
        vm.stopPrank();
    }

    function testFuzz_maxWithdrawableExact(uint64 coll, uint64 debtFrac, uint256 px, uint256 tpx) public {
        coll = uint64(bound(coll, 1e6, 1e12));
        px = bound(px, 5e8, 50e8);
        tpx = bound(tpx, 50e8, 150e8);
        _open(alice, address(tbill), coll, 0);
        uint256 maxM = vault.maxMintable(alice, address(tbill));
        if (maxM == 0) return;
        uint256 debt = bound(debtFrac, 1, maxM);
        vm.prank(alice);
        vault.mint(address(tbill), debt);
        vm.startPrank(admin);
        fx.forceSet(px);
        tbillFeed.forceSet(tpx);
        vm.stopPrank();
        uint256 maxW = vault.maxWithdrawable(alice, address(tbill));
        if (maxW < coll) {
            vm.prank(alice);
            vm.expectRevert();
            vault.withdrawCollateral(address(tbill), maxW + 1);
        }
        if (maxW > 0) {
            vm.prank(alice);
            vault.withdrawCollateral(address(tbill), maxW);
        }
    }

    function testFuzz_supplyEqualsDebtAcrossCollaterals(uint32 a, uint32 b) public {
        uint256 da = bound(a, 1e6, 13_000e6);
        uint256 db = bound(b, 1e6, 10_000e6);
        _open(alice, address(ousd), 1_000e6, da);
        _open(bob, address(tbill), 10e6, db);
        (, uint256 t1) = vault.totals(address(ousd));
        (, uint256 t2) = vault.totals(address(tbill));
        assertEq(xmxn.totalSupply(), t1 + t2);
    }

    function fx_refresh() internal {
        vm.prank(admin);
        fx.setPrice(PX_20);
    }
}
