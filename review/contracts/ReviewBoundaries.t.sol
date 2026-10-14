// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Base} from "test/utils/Base.t.sol";
import {CollateralVault} from "src/CollateralVault.sol";
import {CreditPool} from "src/CreditPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Review-only probes. No deployment or network transactions.
contract ReviewBoundaries is Base {
    function test_maxWithdrawableFractionalFxReverts() public {
        _open(alice, 10e6, 14_000_007);
        vm.prank(admin);
        oracle.forceSet(1_050_000_000); // 10.5 MXN/USD
        uint256 quoted = vault.maxWithdrawable(alice);
        assertEq(quoted, 7_999_999);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.RatioTooLow.selector, 14_999, 15_000));
        vault.withdrawCollateral(quoted);
    }

    function test_cashIsNotBorrowCapacity() public {
        uint256 signerKey = 12345; // fixed local-test key only
        CreditPool pool = new CreditPool(admin, IERC20(address(xmxn)), vm.addr(signerKey));
        _open(alice, 100e6, 75e6);
        vm.startPrank(alice);
        xmxn.approve(address(pool), 75e6);
        pool.supply(75e6);
        vm.stopPrank();
        assertEq(pool.availableLiquidity(), 75e6);
        uint256 expiry = block.timestamp + 900;
        bytes32 dataHash = keccak256("review-local-fixture");
        bytes32 digest = pool.eligibilityDigest(bob, 70e6, expiry, 1, dataHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.ExceedsUtilization.selector, 70e6, 60e6));
        pool.borrow(70e6, 70e6, expiry, 1, dataHash, signature);
    }
}
