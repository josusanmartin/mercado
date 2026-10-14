// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseV2} from "./utils/BaseV2.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// sOUSD (demo staked OUSD): accrual math, donation resistance, inflation attack, reserve exhaustion,
/// and how the vault values it.
contract StakedOUSDTest is BaseV2 {
    function _stake(address user, uint256 amount) internal returns (uint256 shares) {
        _ousd(user, amount);
        vm.startPrank(user);
        IERC20(address(ousd)).approve(address(sousd), amount);
        shares = sousd.deposit(amount, user);
        vm.stopPrank();
    }

    function _fundReserve(uint256 amount) internal {
        _ousd(admin, amount);
        vm.startPrank(admin);
        IERC20(address(ousd)).approve(address(sousd), amount);
        sousd.fundYield(amount);
        vm.stopPrank();
    }

    function test_accruesMockYield() public {
        _fundReserve(1_000e6);
        uint256 shares = _stake(alice, 10_000e6);
        assertEq(sousd.decimals(), 6);
        vm.warp(block.timestamp + 365 days);
        // 5% APR on 10,000 → 10,500 (the extra paid from the pre-funded reserve)
        assertApproxEqAbs(sousd.convertToAssets(shares), 10_500e6, 200); // virtual-share rounding
        (uint256 px,) = sousdFeed.price();
        assertApproxEqAbs(px, 1.05e8, 200);
    }

    function test_donationDoesNotMoveSharePrice() public {
        uint256 shares = _stake(alice, 1_000e6);
        uint256 before = sousd.convertToAssets(shares);
        (uint256 pxBefore,) = sousdFeed.price();
        _ousd(bob, 1_000_000e6);
        vm.prank(bob);
        IERC20(address(ousd)).transfer(address(sousd), 1_000_000e6); // huge donation
        assertEq(sousd.convertToAssets(shares), before);
        (uint256 pxAfter,) = sousdFeed.price();
        assertEq(pxAfter, pxBefore, "collateral valuation can't be pumped by a donation");
    }

    function test_firstDepositorInflationAttackFails() public {
        // attacker deposits 1 unit then donates a lot, hoping the victim's shares round to zero
        _stake(bob, 1);
        _ousd(bob, 10_000e6);
        vm.prank(bob);
        IERC20(address(ousd)).transfer(address(sousd), 10_000e6);
        uint256 victimShares = _stake(alice, 1_000e6);
        assertGt(victimShares, 0);
        assertApproxEqAbs(sousd.convertToAssets(victimShares), 1_000e6, 1);
    }

    function test_yieldStopsWhenReserveRunsDry() public {
        uint256 shares = _stake(alice, 10_000e6); // no reserve funded
        vm.warp(block.timestamp + 365 days);
        assertEq(sousd.convertToAssets(shares), 10_000e6, "no unfunded yield");
        assertEq(sousd.yieldReserve(), 0);
    }

    function test_withdrawPaysAccruedYield() public {
        _fundReserve(1_000e6);
        uint256 shares = _stake(alice, 10_000e6);
        vm.warp(block.timestamp + 365 days / 2);
        vm.prank(alice);
        uint256 got = sousd.redeem(shares, alice, alice);
        assertApproxEqAbs(got, 10_250e6, 2);
    }

    /// review: a late top-up (or donation) must not realize a year of unfunded accrual in one block.
    function test_lateFundingDoesNotBackPayHiddenAccrual() public {
        vm.prank(admin);
        sousd.setApr(2_000);
        uint256 shares = _stake(alice, 100e6);
        vm.warp(block.timestamp + 365 days);
        (uint256 px0,) = sousdFeed.price();
        _ousd(bob, 20e6);
        vm.prank(bob);
        IERC20(address(ousd)).transfer(address(sousd), 20e6); // donation: ignored
        _fundReserve(20e6); // owner funding: checkpoints first, forfeits the unfunded year
        (uint256 px1,) = sousdFeed.price();
        assertEq(px0, 1e8);
        assertEq(px1, px0, "no same-block jump from funding or donation");
        assertEq(sousd.convertToAssets(shares), 100e6);
        vm.warp(block.timestamp + 365 days / 10); // yield resumes from now, at <= 20% APR
        assertApproxEqAbs(sousd.convertToAssets(shares), 102e6, 2);
    }

    function test_aprCapAndOwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert();
        sousd.setApr(100);
        vm.prank(admin);
        vm.expectRevert(bytes("apr"));
        sousd.setApr(2_001);
    }

    /// The vault values sOUSD at its share price: collateral ratio rises as yield accrues, so the depositor
    /// (not the protocol) captures it via a larger maxWithdrawable / maxMintable.
    function test_vaultCapturesYieldForDepositor() public {
        _fundReserve(10_000e6);
        uint256 shares = _stake(alice, 10_000e6);
        vm.startPrank(alice);
        sousd.approve(address(vault), shares);
        vault.depositCollateral(address(sousd), shares);
        vault.mint(address(sousd), 100_000e6); // 200% at 20
        vm.stopPrank();
        uint256 r0 = vault.collateralRatio(alice, address(sousd));
        vm.warp(block.timestamp + 365 days);
        vm.prank(admin);
        fx.setPrice(PX_20);
        uint256 r1 = vault.collateralRatio(alice, address(sousd));
        assertEq(r0, 20_000);
        assertApproxEqAbs(r1, 21_000, 1);
        assertGt(vault.maxWithdrawable(alice, address(sousd)), 0);
    }

    function test_staleUnderlyingFxBlocksSousdMint() public {
        uint256 shares = _stake(alice, 1_000e6);
        vm.startPrank(alice);
        sousd.approve(address(vault), shares);
        vault.depositCollateral(address(sousd), shares);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert();
        vault.mint(address(sousd), 1e6);
        vm.stopPrank();
    }
}
