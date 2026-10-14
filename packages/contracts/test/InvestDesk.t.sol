// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseV2} from "./utils/BaseV2.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InvestDesk} from "../src/v2/InvestDesk.sol";
import {AdminPriceFeed} from "../src/v2/AdminPriceFeed.sol";

/// InvestDesk: demo tTBILL buy/sell vs OUSD and xMXN (through the real MoveAMM). Real TIP-20 precompiles.
contract InvestDeskTest is BaseV2 {
    InvestDesk desk;

    function setUp() public override {
        super.setUp();
        desk = new InvestDesk(admin, IERC20(address(ousd)), IERC20(address(tbill)), IERC20(address(xmxn)), tbillFeed, amm);
        // inventory: 1,000 tTBILL + 10,000 OUSD; AMM equity so xMXN redemptions fit its bucket
        vm.startPrank(admin);
        tbill.mint(admin, 1_000e6);
        ousd.mint(admin, 20_000e6);
        IERC20(address(tbill)).approve(address(desk), 1_000e6);
        IERC20(address(ousd)).approve(address(desk), 10_000e6);
        desk.seed(10_000e6, 1_000e6);
        IERC20(address(ousd)).approve(address(amm), 10_000e6);
        amm.addEquity(10_000e6);
        vm.stopPrank();
    }

    function _buy(address u, uint256 usd) internal returns (uint256 out) {
        _ousd(u, usd);
        vm.startPrank(u);
        IERC20(address(ousd)).approve(address(desk), usd);
        out = desk.buy(usd, 0);
        vm.stopPrank();
    }

    function test_buyAndSellMath() public {
        // $100 tTBILL, 25 bps spread: 1,000 OUSD → 10 tTBILL gross, 0.025 fee → 9.975
        (uint256 q, uint256 fee, uint256 px) = desk.quoteBuy(1_000e6);
        assertEq(px, 100e8);
        assertEq(fee, 25_000);
        assertEq(q, 9_975_000);
        uint256 got = _buy(alice, 1_000e6);
        assertEq(got, 9_975_000);
        assertEq(tbill.balanceOf(alice), 9_975_000);
        (uint256 rO, uint256 rT) = desk.reserves();
        assertEq(rO, 11_000e6);
        assertEq(rT, 1_000e6 - 9_975_000);
        // sell back: 9.975 × 100 = 997.5 gross, fee 2.49375 (ceil) → 995.00625
        vm.startPrank(alice);
        IERC20(address(tbill)).approve(address(desk), got);
        uint256 back = desk.sell(got, 0);
        vm.stopPrank();
        assertEq(back, 995_006_250);
        assertLt(back, 1_000e6, "round trip pays the spread twice");
    }

    function test_finiteInventoryNoMint() public {
        vm.prank(admin);
        desk.setParams(25, 1_000_000e6);
        _ousd(alice, 200_000e6);
        vm.startPrank(alice);
        IERC20(address(ousd)).approve(address(desk), 200_000e6);
        vm.expectRevert(); // InsufficientInventory: only 1,000 tTBILL exist on the desk
        desk.buy(200_000e6, 0);
        vm.stopPrank();
        assertEq(tbill.totalSupply(), 1_000e6, "the desk never mints tTBILL");
    }

    function test_sellLimitedByOusdReserve() public {
        vm.startPrank(admin);
        desk.setParams(25, 1_000_000e6);
        tbill.mint(bob, 500e6); // $50,000 of tTBILL vs a 10,000 OUSD reserve
        vm.stopPrank();
        vm.startPrank(bob);
        IERC20(address(tbill)).approve(address(desk), 500e6);
        vm.expectRevert(abi.encodeWithSelector(InvestDesk.InsufficientInventory.selector, 10_000e6, 49_875e6));
        desk.sell(500e6, 0);
        vm.stopPrank();
    }

    function test_maxTradeAndSlippage() public {
        vm.expectRevert(abi.encodeWithSelector(InvestDesk.TradeTooLarge.selector, 25_000e6 + 1, 25_000e6));
        desk.quoteBuy(25_000e6 + 1);
        _ousd(alice, 100e6);
        vm.startPrank(alice);
        IERC20(address(ousd)).approve(address(desk), 100e6);
        vm.expectRevert(abi.encodeWithSelector(InvestDesk.Slippage.selector, 997_500, 1e6));
        desk.buy(100e6, 1e6);
        vm.stopPrank();
    }

    function test_staleOrPausedFeedReverts() public {
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert(abi.encodeWithSelector(AdminPriceFeed.StalePrice.selector, block.timestamp - 1 days - 1, 1 days));
        desk.quoteBuy(100e6);
        vm.startPrank(admin);
        tbillFeed.forceSet(101e8);
        tbillFeed.setPaused(true);
        vm.stopPrank();
        vm.expectRevert(AdminPriceFeed.FeedPaused.selector);
        desk.quoteSell(1e6);
    }

    function test_priceMoveRepricesTrades() public {
        vm.prank(admin);
        tbillFeed.setPrice(102e8); // T-bill accrual
        (uint256 q,,) = desk.quoteBuy(1_020e6);
        assertEq(q, 9_975_000);
    }

    function test_buyWithXmxnRoutesThroughMoveAmm() public {
        // alice gets xMXN from the AMM, then pays it for tTBILL (AMM burns her xMXN, pays the desk OUSD)
        _ousd(alice, 1_000e6);
        vm.startPrank(alice);
        IERC20(address(ousd)).approve(address(amm), 1_000e6);
        uint256 x = amm.swapOusdForXmxn(1_000e6, 0, alice);
        (, uint256 liabBefore,,,,) = amm.state();
        (uint256 qT, uint256 ousdUsed,) = desk.quoteBuyWithXmxn(x / 2);
        IERC20(address(xmxn)).approve(address(desk), x / 2);
        uint256 got = desk.buyWithXmxn(x / 2, qT);
        vm.stopPrank();
        assertEq(got, qT);
        assertGt(ousdUsed, 0);
        (, uint256 liabAfter,,,,) = amm.state();
        assertEq(liabBefore - liabAfter, x / 2, "the xMXN was burned by the AMM");
        assertEq(xmxn.balanceOf(address(desk)), 0);
    }

    function test_sellForXmxnMintsToSeller() public {
        uint256 t = _buy(alice, 1_000e6);
        vm.startPrank(alice);
        IERC20(address(tbill)).approve(address(desk), t);
        (uint256 qX,,) = desk.quoteSellForXmxn(t);
        uint256 got = desk.sellForXmxn(t, qX);
        vm.stopPrank();
        assertEq(got, qX);
        assertEq(xmxn.balanceOf(alice), got);
        assertEq(IERC20(address(ousd)).balanceOf(address(desk)), 10_000e6 + 1_000e6 - 995_006_250);
    }

    function test_donationsIgnoredAndOwnerOnly() public {
        _ousd(bob, 500e6);
        vm.prank(bob);
        IERC20(address(ousd)).transfer(address(desk), 500e6);
        (uint256 rO,) = desk.reserves();
        assertEq(rO, 10_000e6);
        vm.startPrank(bob);
        vm.expectRevert();
        desk.withdraw(1, 0, bob);
        vm.expectRevert();
        desk.setParams(0, 1);
        vm.stopPrank();
    }

    function test_tbillWorksAsMintCollateral() public {
        uint256 t = _buy(alice, 2_000e6); // ~19.95 tTBILL
        vm.startPrank(alice);
        IERC20(address(tbill)).approve(address(vault), t);
        vault.depositCollateral(address(tbill), t);
        uint256 maxM = vault.maxMintable(alice, address(tbill));
        vault.mint(address(tbill), maxM);
        vm.stopPrank();
        assertEq(xmxn.balanceOf(alice), maxM, "Invest -> Mint loop");
    }
}
