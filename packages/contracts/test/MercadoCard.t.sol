// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseV2} from "./utils/BaseV2.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MercadoCard} from "../src/v2/MercadoCard.sol";

/// Mercado Card on v2 xMXN (real TIP-20 precompile): tap auth, limits, freeze, replay, refunds.
contract MercadoCardTest is BaseV2 {
    MercadoCard card;
    uint256 holderPk = 0xCA4D;
    address holder;
    address shop = makeAddr("tienda"); // Tienda Doña Mary (demo merchant terminal)
    address rogue = makeAddr("rogue");
    uint256 cardId;

    function setUp() public override {
        super.setUp();
        holder = vm.addr(holderPk);
        card = new MercadoCard(admin, IERC20(address(xmxn)));
        vm.prank(admin);
        card.setMerchant(shop, true, "Tienda Dona Mary (demo)");
        _open(holder, address(ousd), 1_000e6, 5_000e6); // holder gets 5,000 xMXN v2
        vm.startPrank(holder);
        IERC20(address(xmxn)).approve(address(card), type(uint256).max);
        cardId = card.issueCard(1_000e6);
        vm.stopPrank();
    }

    function _tap(uint256 pk, uint256 id, address terminal, uint256 amount, bytes32 ref, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 d = card.tapDigest(id, vm.addr(pk), terminal, amount, ref, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, d);
        return abi.encodePacked(r, s, v);
    }

    function _charge(uint256 amount, uint256 nonce) internal returns (uint256) {
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, amount, "ticket-1", nonce, dl);
        vm.prank(shop);
        return card.charge(cardId, amount, "ticket-1", nonce, dl, sig);
    }

    function test_issueAndView() public view {
        MercadoCard.CardView memory v = card.getCard(cardId);
        assertEq(v.holder, holder);
        assertEq(v.dailyLimit, 1_000e6);
        assertEq(v.availableToday, 1_000e6);
        assertLt(v.last4, 10_000);
        assertEq(card.cardsOf(holder).length, 1);
    }

    function test_chargeMovesRealXmxn() public {
        uint256 id = _charge(250e6, 1);
        assertEq(xmxn.balanceOf(shop), 250e6);
        assertEq(xmxn.balanceOf(holder), 4_750e6);
        (uint256 cId, address m, uint256 amt,,) = card.charges(id);
        assertEq(cId, cardId);
        assertEq(m, shop);
        assertEq(amt, 250e6);
        assertEq(card.getCard(cardId).availableToday, 750e6);
        (, uint256 spent,,,) = card.stats();
        assertEq(spent, 250e6);
    }

    function test_nonMerchantCannotCharge() public {
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, rogue, 10e6, "x", 1, dl);
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(MercadoCard.NotMerchant.selector, rogue));
        card.charge(cardId, 10e6, "x", 1, dl, sig);
    }

    function test_merchantCannotChargeWithoutHolderTap() public {
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(0xBAD, cardId, shop, 10e6, "x", 1, dl); // wrong signer
        vm.prank(shop);
        vm.expectRevert(MercadoCard.BadTapSignature.selector);
        card.charge(cardId, 10e6, "x", 1, dl, sig);
        vm.prank(shop);
        vm.expectRevert(MercadoCard.BadTapSignature.selector);
        card.charge(cardId, 10e6, "x", 1, dl, hex"00");
    }

    function test_tapBindsAmountMerchantRefAndDeadline() public {
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "ticket-1", 1, dl);
        vm.startPrank(shop);
        vm.expectRevert(MercadoCard.BadTapSignature.selector);
        card.charge(cardId, 11e6, "ticket-1", 1, dl, sig); // inflated amount
        vm.expectRevert(MercadoCard.BadTapSignature.selector);
        card.charge(cardId, 10e6, "ticket-2", 1, dl, sig); // other reference
        vm.expectRevert(MercadoCard.BadTapSignature.selector);
        card.charge(cardId, 10e6, "ticket-1", 1, dl + 1, sig); // extended deadline
        vm.stopPrank();
        // another allowlisted terminal can't reuse a tap signed for this one
        address shop2 = makeAddr("shop2");
        vm.prank(admin);
        card.setMerchant(shop2, true, "Other demo shop");
        vm.prank(shop2);
        vm.expectRevert(MercadoCard.BadTapSignature.selector);
        card.charge(cardId, 10e6, "ticket-1", 1, dl, sig);
    }

    function test_tapReplayRejected() public {
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "t", 7, dl);
        vm.startPrank(shop);
        card.charge(cardId, 10e6, "t", 7, dl, sig);
        vm.expectRevert(abi.encodeWithSelector(MercadoCard.TapReplayed.selector, 7));
        card.charge(cardId, 10e6, "t", 7, dl, sig);
        vm.stopPrank();
    }

    function test_expiredTapRejected() public {
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "t", 1, dl);
        vm.warp(dl + 1);
        vm.prank(shop);
        vm.expectRevert(abi.encodeWithSelector(MercadoCard.TapExpired.selector, dl));
        card.charge(cardId, 10e6, "t", 1, dl, sig);
    }

    function test_frozenCardRejectedAndOnlyHolderFreezes() public {
        vm.prank(rogue);
        vm.expectRevert(MercadoCard.NotHolder.selector);
        card.setFrozen(cardId, true);
        vm.prank(holder);
        card.setFrozen(cardId, true);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "t", 1, dl);
        vm.prank(shop);
        vm.expectRevert(abi.encodeWithSelector(MercadoCard.CardIsFrozen.selector, cardId));
        card.charge(cardId, 10e6, "t", 1, dl, sig);
        vm.prank(holder);
        card.setFrozen(cardId, false);
        vm.prank(shop);
        card.charge(cardId, 10e6, "t", 1, dl, sig);
    }

    function test_dailyLimitIsALeakyBucket() public {
        _charge(800e6, 1);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 300e6, "ticket-1", 2, dl);
        vm.prank(shop);
        vm.expectRevert(abi.encodeWithSelector(MercadoCard.OverDailyLimit.selector, 1_100e6, 1_000e6));
        card.charge(cardId, 300e6, "ticket-1", 2, dl, sig);
        // 12h later half the limit has drained: 800 - 500 = 300 spent, 700 available
        vm.warp(block.timestamp + 12 hours);
        assertEq(card.getCard(cardId).availableToday, 700e6);
        _charge(700e6, 3);
        assertEq(card.getCard(cardId).availableToday, 0);
    }

    function test_limitOnlyByHolderAndBounded() public {
        vm.prank(rogue);
        vm.expectRevert(MercadoCard.NotHolder.selector);
        card.setDailyLimit(cardId, 5_000e6);
        vm.startPrank(holder);
        vm.expectRevert(MercadoCard.InvalidLimit.selector);
        card.setDailyLimit(cardId, 0);
        vm.expectRevert(MercadoCard.InvalidLimit.selector);
        card.setDailyLimit(cardId, 100_000e6 + 1);
        card.setDailyLimit(cardId, 200e6);
        vm.stopPrank();
        assertEq(card.getCard(cardId).availableToday, 200e6);
    }

    function test_allowanceIsASecondCap() public {
        vm.prank(holder);
        IERC20(address(xmxn)).approve(address(card), 5e6);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "t", 1, dl);
        vm.prank(shop);
        vm.expectRevert(); // TIP-20 InsufficientAllowance
        card.charge(cardId, 10e6, "t", 1, dl, sig);
    }

    function test_refunds() public {
        uint256 id = _charge(300e6, 1);
        vm.prank(rogue);
        vm.expectRevert(MercadoCard.NotChargeMerchant.selector);
        card.refund(id, 1);
        vm.startPrank(shop);
        IERC20(address(xmxn)).approve(address(card), type(uint256).max);
        card.refund(id, 100e6);
        card.refund(id, 200e6);
        vm.expectRevert(abi.encodeWithSelector(MercadoCard.RefundTooLarge.selector, 0, 1));
        card.refund(id, 1);
        vm.stopPrank();
        assertEq(xmxn.balanceOf(holder), 5_000e6);
        (,, uint256 refunded,,) = card.stats();
        assertEq(refunded, 300e6);
    }

    function test_onlyOwnerAllowlistsAndPauses() public {
        vm.prank(rogue);
        vm.expectRevert();
        card.setMerchant(rogue, true, "me");
        vm.prank(admin);
        card.pause();
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "t", 1, dl);
        vm.prank(shop);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        card.charge(cardId, 10e6, "t", 1, dl, sig);
        // delisted merchant can't charge
        vm.startPrank(admin);
        card.unpause();
        card.setMerchant(shop, false, "");
        vm.stopPrank();
        vm.prank(shop);
        vm.expectRevert(abi.encodeWithSelector(MercadoCard.NotMerchant.selector, shop));
        card.charge(cardId, 10e6, "t", 1, dl, sig);
    }

    function test_crossCardTapRejected() public {
        vm.prank(holder);
        uint256 card2 = card.issueCard(1_000e6);
        uint256 dl = block.timestamp + 60;
        bytes memory sig = _tap(holderPk, cardId, shop, 10e6, "t", 1, dl); // signed for card 1
        vm.prank(shop);
        vm.expectRevert(MercadoCard.BadTapSignature.selector);
        card.charge(card2, 10e6, "t", 1, dl, sig);
    }
}
