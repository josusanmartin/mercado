// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {InvestDeskTest} from "test/InvestDesk.t.sol";
import {InvestDesk} from "src/v2/InvestDesk.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract ReviewInvest is InvestDeskTest {
    function test_reviewPublicFaucetCannotSellBack() public {
        address visitor = makeAddr("unfunded-visitor");
        assertEq(ousd.balanceOf(visitor), 0);
        vm.startPrank(visitor);
        tbill.faucet(100e6);
        tbill.approve(address(desk), 100e6);
        vm.expectRevert(abi.encodeWithSelector(InvestDesk.ExceedsBoughtBalance.selector,0,100e6));
        desk.sell(100e6, 0);
        vm.expectRevert(abi.encodeWithSelector(InvestDesk.ExceedsBoughtBalance.selector,0,100e6));
        desk.sellForXmxn(100e6,0);
        vm.stopPrank();
        assertEq(ousd.balanceOf(visitor), 0);
        assertEq(desk.reserveOusd(), 10000e6);
    }
    function test_reviewPausedDeskRefusesQuoteAndTrade() public {
        vm.prank(admin); desk.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector); desk.quoteBuy(100e6);
        vm.expectRevert(Pausable.EnforcedPause.selector); desk.quoteSell(1e6);
        _ousd(alice, 100e6);
        vm.startPrank(alice); ousd.approve(address(desk), 100e6);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        desk.buy(100e6, 1); vm.stopPrank();
        assertEq(ousd.balanceOf(alice), 100e6);
    }
    function test_reviewBuybackEligibilityDoesNotFollowTransferredTokens() public {
        uint256 got=_buy(alice,1000e6);
        vm.prank(alice);tbill.transfer(bob,got);
        vm.startPrank(bob);tbill.approve(address(desk),got);
        vm.expectRevert(abi.encodeWithSelector(InvestDesk.ExceedsBoughtBalance.selector,0,got));
        desk.sell(got,0);vm.stopPrank();
        assertEq(desk.bought(alice),got);assertEq(desk.bought(bob),0);
    }
    function testFuzz_reviewRoundTripCannotProfitAtFixedPrice(uint128 input) public {
        uint256 amount = bound(uint256(input), 1e6, 25000e6);
        uint256 got = _buy(alice, amount);
        vm.startPrank(alice); tbill.approve(address(desk), got);
        uint256 returned = desk.sell(got, 0); vm.stopPrank();
        assertLt(returned, amount);
        assertEq(tbill.balanceOf(address(desk)), desk.reserveTbill());
        assertEq(ousd.balanceOf(address(desk)), desk.reserveOusd());
    }
    function test_reviewXmxnSlippageRevertsEntireRedemption() public {
        _ousd(alice, 1000e6);
        vm.startPrank(alice); ousd.approve(address(amm), 1000e6);
        amm.swapOusdForXmxn(1000e6, 0, alice);
        xmxn.approve(address(desk), 1000e6); vm.stopPrank();
        uint256 beforeX = xmxn.balanceOf(alice);
        uint256 beforeR = amm.reserve(); uint256 beforeL = amm.liability();
        (uint256 quote,,) = desk.quoteBuyWithXmxn(1000e6);
        vm.prank(alice); vm.expectRevert(abi.encodeWithSelector(InvestDesk.Slippage.selector, quote, quote+1));
        desk.buyWithXmxn(1000e6, quote+1);
        assertEq(xmxn.balanceOf(alice), beforeX);
        assertEq(amm.reserve(), beforeR); assertEq(amm.liability(), beforeL);
        assertEq(desk.reserveOusd(), 10000e6);
    }
}
