// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Base} from "test/utils/Base.t.sol";
import {StakedOUSD} from "src/v2/StakedOUSD.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ReviewV2Staked is Base {
    function test_donationAfterDryYearDoesNotReprice() public {
        StakedOUSD s = new StakedOUSD(IERC20(address(ousd)), admin, 2_000);
        _fundOusd(alice, 100e6);
        vm.startPrank(alice);
        ousd.approve(address(s), 100e6);
        s.deposit(100e6, alice);
        vm.stopPrank();
        vm.warp(block.timestamp + 365 days);
        uint256 beforePx = s.convertToAssets(1e6);
        assertEq(beforePx, 1e6); // no funded yield reserve
        _fundOusd(bob, 20e6);
        vm.prank(bob);
        ousd.transfer(address(s), 20e6); // permissionless direct donation, no time passes
        uint256 afterPx = s.convertToAssets(1e6);
        emit log_named_uint("price before donation", beforePx);
        emit log_named_uint("price after same-block donation", afterPx);
        assertEq(afterPx, beforePx);
        assertEq(s.totalAssets(), 100e6);
        _fundOusd(admin, 20e6);
        vm.startPrank(admin); ousd.approve(address(s),20e6); s.fundYield(20e6); vm.stopPrank();
        assertEq(s.convertToAssets(1e6),beforePx); // funding cannot recognize the unfunded past
        vm.warp(block.timestamp + 365 days);
        assertGt(s.convertToAssets(1e6),1_199_990);
        assertEq(s.totalAssets(),120e6);
    }
    function test_freshDonationDoesNotReprice() public {
        StakedOUSD s = new StakedOUSD(IERC20(address(ousd)), admin, 2_000);
        _fundOusd(alice, 120e6);
        vm.startPrank(alice);
        ousd.approve(address(s), 100e6);
        s.deposit(100e6, alice);
        uint256 beforePx = s.convertToAssets(1e6);
        ousd.transfer(address(s), 20e6);
        assertEq(s.convertToAssets(1e6), beforePx);
        vm.stopPrank();
    }
}
