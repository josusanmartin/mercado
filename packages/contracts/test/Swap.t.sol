// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Base} from "./utils/Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SwapDesk} from "../src/SwapDesk.sol";

/// SwapDesk: finite separately seeded reserves, slippage, caps, no access to vault collateral.
/// Local, real TIP-20 precompiles (network = "tempo").
contract SwapTest is Base {
    SwapDesk desk;
    address lp = makeAddr("lp");

    function setUp() public override {
        super.setUp();
        desk = new SwapDesk(admin, IERC20(address(ousd)), IERC20(address(xmxn)), oracle);
        // LP mints desk inventory from its OWN vault position, then seeds the desk
        _open(lp, 2_000e6, 20_000e6);
        _fundOusd(lp, 1_000e6);
        vm.startPrank(lp);
        ousd.approve(address(desk), 1_000e6);
        xmxn.approve(address(desk), 20_000e6);
        desk.seed(1_000e6, 20_000e6);
        vm.stopPrank();
        _open(alice, 10_000e6, 0); // gives alice OUSD in vault; fund her wallet separately
        _fundOusd(alice, 5_000e6);
    }

    function _swapIn(address user, uint256 amountIn) internal returns (uint256 out) {
        vm.startPrank(user);
        ousd.approve(address(desk), amountIn);
        out = desk.swapOusdForXmxn(amountIn, 0);
        vm.stopPrank();
    }

    function test_quoteMath() public view {
        // 100 OUSD * 20 = 2,000 xMXN gross; 0.5% fee = 10 → 1,990 out
        (uint256 out, uint256 fee) = desk.quote(true, 100e6);
        assertEq(fee, 10e6);
        assertEq(out, 1_990e6);
        // 2,000 xMXN / 20 = 100 OUSD gross; fee 0.5 → 99.5 out
        (out, fee) = desk.quote(false, 2_000e6);
        assertEq(fee, 500_000);
        assertEq(out, 99_500_000);
    }

    function test_swapBothWays() public {
        uint256 out = _swapIn(alice, 100e6);
        assertEq(out, 1_990e6);
        assertEq(xmxn.balanceOf(alice), 1_990e6);
        (uint256 rO, uint256 rX) = desk.reserves();
        assertEq(rO, 1_100e6);
        assertEq(rX, 20_000e6 - 1_990e6);

        vm.startPrank(alice);
        xmxn.approve(address(desk), 1_990e6);
        uint256 back = desk.swapXmxnForOusd(1_990e6, 0);
        vm.stopPrank();
        assertEq(back, 99_002_500); // 1,990/20 = 99.5 less 0.5%
    }

    function test_swapNeverTouchesVaultCollateral() public {
        uint256 vaultOusd = ousd.balanceOf(address(vault));
        uint256 vaultTotal = vault.totalCollateral();
        _swapIn(alice, 500e6);
        vm.startPrank(alice);
        xmxn.approve(address(desk), 5_000e6);
        desk.swapXmxnForOusd(5_000e6, 0);
        vm.stopPrank();
        assertEq(ousd.balanceOf(address(vault)), vaultOusd);
        assertEq(vault.totalCollateral(), vaultTotal);
        assertEq(IERC20(address(ousd)).allowance(address(vault), address(desk)), 0);
    }

    function test_cannotDrainMoreThanReserves() public {
        vm.prank(admin);
        desk.setParams(50, 100_000e6, 1_000_000e6);
        _swapIn(alice, 500e6); // 9,950 xMXN out → reserves 1,500 OUSD / 10,050 xMXN
        (uint256 rO, uint256 rX) = desk.reserves();
        assertEq(rO, 1_500e6);
        assertEq(rX, 10_050e6);
        // the vault holds 12,000+ OUSD, but the desk can only pay out its own 1,500
        assertGt(vault.totalCollateral(), 10_000e6);
        vm.startPrank(alice);
        vault.mint(30_000e6); // alice's own vault position
        xmxn.approve(address(desk), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.InsufficientReserves.selector, 1_500e6, 1_542_250_000));
        desk.swapXmxnForOusd(31_000e6, 0); // 1,550 OUSD gross
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.InsufficientReserves.selector, 10_050e6, 11_940e6));
        desk.quote(true, 600e6);
    }

    function test_minOutSlippage() public {
        vm.startPrank(alice);
        ousd.approve(address(desk), 100e6);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.Slippage.selector, 1_990e6, 1_990e6 + 1));
        desk.swapOusdForXmxn(100e6, 1_990e6 + 1);
        desk.swapOusdForXmxn(100e6, 1_990e6);
        vm.stopPrank();
    }

    function test_maxSwapSize() public {
        vm.prank(admin);
        desk.setParams(50, 10_000e6, 1_000_000e6);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.SwapTooLarge.selector, 10_000e6 + 20, 10_000e6));
        desk.quote(true, 500_000_001);
    }

    function test_dailyCapPerAddress() public {
        _open(lp, 4_000e6, 40_000e6); // more xMXN inventory so reserves aren't the binding limit
        vm.startPrank(lp);
        xmxn.approve(address(desk), 40_000e6);
        desk.seed(0, 40_000e6);
        vm.stopPrank();
        assertEq(desk.remainingDailyCap(alice), 2_000e6);
        _swapIn(alice, 400e6);
        _swapIn(alice, 400e6);
        assertEq(desk.remainingDailyCap(alice), 1_200e6);
        // xMXN -> OUSD counts the gross OUSD equivalent: 2,000 xMXN = 100 OUSD
        vm.startPrank(alice);
        xmxn.approve(address(desk), 2_000e6);
        desk.swapXmxnForOusd(2_000e6, 0);
        vm.stopPrank();
        assertEq(desk.remainingDailyCap(alice), 1_100e6);
        _swapIn(alice, 400e6);
        _swapIn(alice, 400e6);
        vm.startPrank(alice);
        ousd.approve(address(desk), 300e6 + 1);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.DailyCapExceeded.selector, 2_000e6 + 1, 2_000e6));
        desk.swapOusdForXmxn(300e6 + 1, 0);
        vm.stopPrank();
        // another address is unaffected; the window resets after 24h
        _fundOusd(bob, 100e6);
        _swapIn(bob, 100e6);
        vm.warp(block.timestamp + 1 days);
        vm.prank(admin);
        oracle.setPrice(PX_20); // keep the feed fresh
        assertEq(desk.remainingDailyCap(alice), 2_000e6);
        _swapIn(alice, 300e6 + 1);
    }

    function test_pauseBlocksSwaps() public {
        vm.prank(alice);
        vm.expectRevert();
        desk.pause();
        vm.prank(admin);
        desk.pause();
        vm.startPrank(alice);
        ousd.approve(address(desk), 100e6);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        desk.swapOusdForXmxn(100e6, 0);
        vm.stopPrank();
        vm.prank(admin);
        desk.unpause();
        _swapIn(alice, 100e6);
    }

    function test_staleOracleBlocksSwaps() public {
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert();
        desk.quote(true, 100e6);
        vm.startPrank(alice);
        ousd.approve(address(desk), 100e6);
        vm.expectRevert();
        desk.swapOusdForXmxn(100e6, 0);
        vm.stopPrank();
    }

    function test_donationsNotCountedAndOnlyOwnerWithdraws() public {
        _fundOusd(bob, 500e6);
        vm.prank(bob);
        ousd.transfer(address(desk), 500e6); // direct transfer, not seed()
        (uint256 rO,) = desk.reserves();
        assertEq(rO, 1_000e6);

        vm.prank(lp);
        vm.expectRevert();
        desk.withdrawReserves(1, 0, lp);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.InsufficientReserves.selector, 1_000e6, 1_000e6 + 1));
        desk.withdrawReserves(1_000e6 + 1, 0, admin);
        vm.prank(admin);
        desk.withdrawReserves(1_000e6, 20_000e6, admin);
        (uint256 o, uint256 x) = desk.reserves();
        assertEq(o + x, 0);
    }

    function test_anyoneCanSeed() public {
        _fundOusd(bob, 50e6);
        vm.startPrank(bob);
        ousd.approve(address(desk), 50e6);
        desk.seed(50e6, 0);
        vm.stopPrank();
        (uint256 rO,) = desk.reserves();
        assertEq(rO, 1_050e6);
    }

    function testFuzz_swapOutWithinReservesAndMinOut(uint64 amountIn) public {
        amountIn = uint64(bound(amountIn, 1, 2_000e6));
        (uint256 rO0, uint256 rX0) = desk.reserves();
        vm.startPrank(alice);
        ousd.approve(address(desk), amountIn);
        try desk.quote(true, amountIn) returns (uint256 q, uint256) {
            uint256 out = desk.swapOusdForXmxn(amountIn, q);
            assertEq(out, q);
            assertLe(out, rX0);
            (uint256 rO1, uint256 rX1) = desk.reserves();
            assertEq(rO1, rO0 + amountIn);
            assertEq(rX1, rX0 - out);
            assertEq(xmxn.balanceOf(address(desk)), rX1);
        } catch {}
        vm.stopPrank();
    }
}
