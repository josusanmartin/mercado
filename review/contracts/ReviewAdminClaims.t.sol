// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {BaseV2} from "test/utils/BaseV2.t.sol";
import {LoanAttestationTest} from "test/LoanAttestation.t.sol";
import {DemoRWA} from "src/v2/DemoRWA.sol";
import {FixedPriceFeed} from "src/v2/FixedPriceFeed.sol";

// Local authority demonstrations for /contracts copy, never a live exploit.
contract ReviewAdminVaultClaims is BaseV2 {
    function test_reviewOwnerCanCreateCollateralAndMintToSelf() public {
        vm.startPrank(admin);
        DemoRWA ownToken = new DemoRWA("Local review fixture", "FIX", admin, 0);
        FixedPriceFeed ownFeed = new FixedPriceFeed(1_000_000e8, "Owner chosen valuation");
        vault.addCollateral(address(ownToken), ownFeed, 15_000, 13_500, 1000, 2_000_000e6);
        ownToken.mint(admin, 1e6);
        ownToken.approve(address(vault), 1e6);
        vault.depositCollateral(address(ownToken), 1e6);
        vault.mint(address(ownToken), 1_000_000e6);
        vm.stopPrank();
        assertEq(xmxn.balanceOf(admin), 1_000_000e6);
    }
    function test_reviewOwnerCanChangeFxSafetyBounds() public {
        vm.startPrank(admin);
        fx.setConfig(365 days, 1, 1000e8, 10_000);
        fx.forceSet(200e8);
        vm.stopPrank();
        (uint256 px,) = fx.price();
        assertEq(px, 200e8);
        assertEq(fx.maxAge(), 365 days);
    }
    function test_reviewTbillForceSetBypassesTwoPercentJump() public {
        vm.prank(admin); tbillFeed.forceSet(150e8);
        (uint256 px,) = tbillFeed.price();
        assertEq(px, 150e8);
    }
}

contract ReviewAdminPoolClaims is LoanAttestationTest {
    function test_reviewOwnerCanAuthorizeOwnBorrowOfAllLenderCash() public {
        uint256 localKey = 0xB0B;
        vm.startPrank(admin);
        pool.setAttestationSigner(vm.addr(localKey));
        pool.setParams(0, 10_000e6, 10_000);
        vm.stopPrank();
        uint256 expiry = block.timestamp + 60;
        bytes memory signature = _sign(localKey, address(pool), admin, 10_000e6, expiry, 991);
        vm.prank(admin);
        pool.borrow(10_000e6, 10_000e6, expiry, 991, DATA, signature);
        assertEq(xmxn.balanceOf(admin), 10_000e6);
        assertEq(pool.availableLiquidity(), 0);
        assertEq(pool.lenderBalance(lender), 10_000e6);
    }
}
