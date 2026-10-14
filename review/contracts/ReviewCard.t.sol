// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MercadoCardTest} from "test/MercadoCard.t.sol";
import {MercadoCard} from "src/v2/MercadoCard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ReviewCard is MercadoCardTest {
    function test_reviewTapCannotCrossDeployment() public {
        MercadoCard other = new MercadoCard(admin, IERC20(address(xmxn)));
        vm.prank(admin); other.setMerchant(shop, true, "other");
        vm.startPrank(holder);
        uint256 id = other.issueCard(1000e6);
        xmxn.approve(address(other), type(uint256).max);
        vm.stopPrank();
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "ticket", 42, dl);
        vm.prank(shop); vm.expectRevert(MercadoCard.BadTapSignature.selector);
        other.charge(id, 10e6, "ticket", 42, dl, sig);
        assertEq(other.chargeCount(), 0);
        assertFalse(other.nonceUsed(id, 42));
    }
    function test_reviewTapCannotCrossChain() public {
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "ticket", 42, dl);
        vm.chainId(block.chainid + 1);
        vm.prank(shop); vm.expectRevert(MercadoCard.BadTapSignature.selector);
        card.charge(cardId, 10e6, "ticket", 42, dl, sig);
    }
    function test_reviewAllowlistedOtherMerchantCannotStealTap() public {
        vm.prank(admin); card.setMerchant(rogue, true, "other shop");
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "ticket", 42, dl);
        vm.prank(rogue); vm.expectRevert(MercadoCard.BadTapSignature.selector);
        card.charge(cardId, 10e6, "ticket", 42, dl, sig);
        assertEq(xmxn.balanceOf(rogue), 0);
    }
    function test_reviewFailedTransferRollsBackAuthAndAccounting() public {
        vm.prank(holder); xmxn.approve(address(card), 0);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "ticket", 42, dl);
        vm.prank(shop); vm.expectRevert();
        card.charge(cardId, 10e6, "ticket", 42, dl, sig);
        assertFalse(card.nonceUsed(cardId, 42));
        assertEq(card.chargeCount(), 0); assertEq(card.totalSpent(), 0);
        assertEq(card.getCard(cardId).availableToday, 1000e6);
        vm.prank(holder); xmxn.approve(address(card), 10e6);
        vm.prank(shop); card.charge(cardId, 10e6, "ticket", 42, dl, sig);
        assertTrue(card.nonceUsed(cardId, 42));
        assertEq(card.totalSpent(), 10e6);
    }
    function test_reviewSameDayRefundRestoresCapacityButNotTap() public {
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 250e6, "ticket", 42, dl);
        vm.prank(shop); uint256 id = card.charge(cardId, 250e6, "ticket", 42, dl, sig);
        vm.startPrank(shop); xmxn.approve(address(card), 250e6); card.refund(id, 250e6);
        vm.expectRevert(abi.encodeWithSelector(MercadoCard.TapReplayed.selector, 42));
        card.charge(cardId, 250e6, "ticket", 42, dl, sig); vm.stopPrank();
        assertEq(card.getCard(cardId).availableToday, 1000e6);
        assertEq(xmxn.balanceOf(holder), 5000e6);
    }
    function test_reviewFrozenHolderCanReceiveRefundFromDelistedMerchant() public {
        uint256 id = _charge(250e6, 1);
        vm.prank(holder); card.setFrozen(cardId, true);
        vm.startPrank(admin); card.setMerchant(shop, false, "delisted"); card.pause(); vm.stopPrank();
        vm.startPrank(shop); xmxn.approve(address(card), 250e6); card.refund(id, 250e6); vm.stopPrank();
        assertEq(xmxn.balanceOf(holder), 5000e6);
    }
    function test_reviewLowerLimitBlocksPreviouslySignedTap() public {
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 900e6, "ticket", 42, dl);
        vm.prank(holder); card.setDailyLimit(cardId, 100e6);
        vm.prank(shop); vm.expectRevert(abi.encodeWithSelector(MercadoCard.OverDailyLimit.selector, 900e6, 100e6));
        card.charge(cardId, 900e6, "ticket", 42, dl, sig);
        assertFalse(card.nonceUsed(cardId, 42));
    }
    function test_reviewNoRefillUntilCdmxMidnight() public {
        uint256 midnight = card.dayStart(card.today()+1);
        vm.warp(midnight + 1 hours);
        _charge(1000e6, 1);
        vm.warp(block.timestamp + 12 hours);
        assertEq(card.getCard(cardId).availableToday, 0);
        uint256 dl=block.timestamp+60;
        bytes memory sig=_tap(holderPk,cardId,shop,1,"ticket",2,dl);
        vm.prank(shop);vm.expectRevert(abi.encodeWithSelector(MercadoCard.OverDailyLimit.selector,1000e6+1,1000e6));
        card.charge(cardId,1,"ticket",2,dl,sig);
        assertEq(card.totalSpent(), 1000e6);
        assertEq(card.getCard(cardId).dailyLimit, 1000e6);
        assertEq(card.getCard(cardId).spentToday, 1000e6);
        vm.warp(midnight+1 days);
        assertEq(card.getCard(cardId).spentToday,0);
        _charge(500e6,2);
        assertEq(card.getCard(cardId).spentToday,500e6);
    }
    function testFuzz_reviewPartialRefundCannotExceedCharge(uint128 part) public {
        uint256 amount = bound(uint256(part), 1, 250e6 - 1);
        uint256 id = _charge(250e6, 1);
        vm.startPrank(shop); xmxn.approve(address(card), type(uint256).max);
        card.refund(id, amount); card.refund(id, 250e6 - amount);
        vm.expectRevert(abi.encodeWithSelector(MercadoCard.RefundTooLarge.selector, 0, 1));
        card.refund(id, 1); vm.stopPrank();
        assertEq(card.totalRefunded(), 250e6);
        assertEq(xmxn.balanceOf(holder), 5000e6);
    }
}
