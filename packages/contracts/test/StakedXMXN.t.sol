// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseV2} from "./utils/BaseV2.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StakedXMXN} from "../src/v2/StakedXMXN.sol";

/// sxMXN: the StakedOUSD logic over xMXN v2 (real TIP-20 precompile). Same accrual, same donation-proofing.
contract StakedXMXNTest is BaseV2 {
    StakedXMXN sx;

    function setUp() public override {
        super.setUp();
        sx = new StakedXMXN(IERC20(address(xmxn)), admin, 800); // 8.00% configured APR
        _open(admin, address(ousd), 100_000e6, 1_000_000e6); // admin gets xMXN for the reserve
        _open(alice, address(ousd), 10_000e6, 50_000e6);
        vm.startPrank(admin);
        IERC20(address(xmxn)).approve(address(sx), 100_000e6);
        sx.fundYield(100_000e6);
        vm.stopPrank();
    }

    function _deposit(address u, uint256 amt) internal returns (uint256 shares) {
        vm.startPrank(u);
        IERC20(address(xmxn)).approve(address(sx), amt);
        shares = sx.deposit(amt, u);
        vm.stopPrank();
    }

    function test_identity() public view {
        assertEq(sx.name(), "Mercado peso savings (sxMXN, testnet)");
        assertEq(sx.symbol(), "sxMXN");
        assertEq(sx.decimals(), 6);
        assertEq(sx.asset(), address(xmxn));
        assertEq(sx.aprBps(), 800);
    }

    function test_accruesEightPercentInPesos() public {
        uint256 s = _deposit(alice, 10_000e6);
        vm.warp(block.timestamp + 365 days);
        assertApproxEqAbs(sx.convertToAssets(s), 10_800e6, 200);
        vm.prank(alice);
        uint256 got = sx.redeem(s, alice, alice);
        assertApproxEqAbs(got, 10_800e6, 200);
    }

    function test_donationDoesNotMovePrice() public {
        uint256 s = _deposit(alice, 1_000e6);
        uint256 before = sx.convertToAssets(s);
        vm.prank(admin);
        IERC20(address(xmxn)).transfer(address(sx), 500_000e6);
        assertEq(sx.convertToAssets(s), before);
    }

    function test_lateFundingDoesNotBackPay() public {
        StakedXMXN dry = new StakedXMXN(IERC20(address(xmxn)), admin, 2_000);
        vm.startPrank(alice);
        IERC20(address(xmxn)).approve(address(dry), 1_000e6);
        uint256 s = dry.deposit(1_000e6, alice);
        vm.stopPrank();
        vm.warp(block.timestamp + 365 days);
        vm.startPrank(admin);
        IERC20(address(xmxn)).approve(address(dry), 1_000e6);
        dry.fundYield(1_000e6);
        vm.stopPrank();
        assertEq(dry.convertToAssets(s), 1_000e6, "unfunded year forfeited");
    }

    function test_onlyOwnerSetsAprWithinCap() public {
        vm.prank(alice);
        vm.expectRevert();
        sx.setApr(900);
        vm.prank(admin);
        vm.expectRevert(bytes("apr"));
        sx.setApr(2_001);
        vm.prank(admin);
        sx.setApr(900);
    }
}
