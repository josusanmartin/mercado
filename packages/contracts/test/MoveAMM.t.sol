// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseV2} from "./utils/BaseV2.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MoveAMM} from "../src/v2/MoveAMM.sol";

/// MOVE: vault-integrated vAMM / PSM. Pricing, size impact, solvency under peso appreciation, NAV redemptions,
/// caps, equity gate, separation from CDP collateral. Real TIP-20 precompiles (network = "tempo").
contract MoveAMMTest is BaseV2 {
    address sender = makeAddr("sender"); // US sender
    address rosa = makeAddr("rosa"); // MX recipient

    function _mintVia(address user, uint256 usdIn, address to) internal returns (uint256 out) {
        _ousd(user, usdIn);
        vm.startPrank(user);
        IERC20(address(ousd)).approve(address(amm), usdIn);
        out = amm.swapOusdForXmxn(usdIn, 0, to);
        vm.stopPrank();
    }

    function _redeem(address user, uint256 xIn) internal returns (uint256 out) {
        vm.startPrank(user);
        IERC20(address(xmxn)).approve(address(amm), xIn);
        out = amm.swapXmxnForOusd(xIn, 0, user);
        vm.stopPrank();
    }

    function _equity(uint256 amount) internal {
        _ousd(admin, amount);
        vm.startPrank(admin);
        IERC20(address(ousd)).approve(address(amm), amount);
        amm.addEquity(amount);
        vm.stopPrank();
    }

    function _setFx(uint256 px) internal {
        vm.prank(admin);
        fx.forceSet(px);
    }

    // ------------------------------------------------------------ pricing

    function test_quoteMathAndImpact() public view {
        // 100 USD at 20: atMid 2,000; impact 100/(250,000+100) → 1,999.2003…; fee 20bps
        (uint256 out, uint256 fee, uint256 mid, uint256 impact) = amm.quote(true, 100e6);
        assertEq(mid, 20e8);
        assertEq(impact, 4); // 0.04%
        assertEq(out + fee, 1_999_200_319);
        assertEq(fee, 3_998_401);
        // impact grows with size
        (,,, uint256 impactBig) = amm.quote(true, 10_000e6);
        assertEq(impactBig, 385); // 3.85%
    }

    function test_remittanceMintsToRecipientInOneTx() public {
        uint256 out = _mintVia(sender, 100e6, rosa);
        assertEq(xmxn.balanceOf(rosa), out);
        assertEq(xmxn.totalSupply(), out);
        (uint256 r, uint256 l,, uint256 cov,,) = amm.state();
        assertEq(r, 100e6);
        assertEq(l, out);
        assertGt(cov, 10_000, "fee keeps the AMM over-covered");
    }

    function test_roundTripLosesOnlySpreadAndImpact() public {
        _equity(5_000e6); // demo usability comes from equity (25% bucket, no floor)
        uint256 x = _mintVia(alice, 1_000e6, alice);
        uint256 back = _redeem(alice, x);
        assertLt(back, 1_000e6);
        assertGt(back, 980e6); // round trip at 1,000 USD: 2×20bps fee + 2×~0.4% size impact ≈ 1.5%
        (uint256 r, uint256 l,,,,) = amm.state();
        assertEq(l, 0);
        assertEq(r, 6_000e6 - back, "spread stays in the reserve");
    }

    function test_minOutSlippage() public {
        _ousd(alice, 100e6);
        vm.startPrank(alice);
        IERC20(address(ousd)).approve(address(amm), 100e6);
        (uint256 q,,,) = amm.quote(true, 100e6);
        vm.expectRevert(abi.encodeWithSelector(MoveAMM.Slippage.selector, q, q + 1));
        amm.swapOusdForXmxn(100e6, q + 1, alice);
        vm.stopPrank();
    }

    function test_maxSwapSize() public {
        vm.expectRevert(abi.encodeWithSelector(MoveAMM.SwapTooLarge.selector, 10_000e6 + 1, 10_000e6));
        amm.quote(true, 10_000e6 + 1);
    }

    function test_staleOraclePausesBothDirections() public {
        _mintVia(alice, 100e6, alice);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert();
        amm.quote(true, 10e6);
        vm.expectRevert();
        amm.quote(false, 10e6);
    }

    // ------------------------------------------------------------ separation

    function test_cannotTouchCdpCollateral() public {
        _equity(2_500e6);
        _open(bob, address(ousd), 10_000e6, 0); // 10,000 OUSD locked in the CDP vault
        _mintVia(alice, 100e6, alice);
        uint256 vaultBal = IERC20(address(ousd)).balanceOf(address(vault));
        _redeem(alice, xmxn.balanceOf(alice));
        assertEq(IERC20(address(ousd)).balanceOf(address(vault)), vaultBal);
        (uint256 c,) = vault.totals(address(ousd));
        assertEq(c, 10_000e6);
    }

    /// lead's fix: CDP-minted xMXN may redeem only up to the AMM's own liability, so it can't drain equity.
    function test_cdpXmxnCannotDrainEquity() public {
        _equity(5_000e6);
        _open(bob, address(ousd), 10_000e6, 50_000e6); // CDP-minted xMXN
        vm.startPrank(bob);
        IERC20(address(xmxn)).approve(address(amm), 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(MoveAMM.ExceedsLiability.selector, 0, 1_000e6));
        amm.swapXmxnForOusd(1_000e6, 0, bob);
        vm.stopPrank();
        // once the AMM has liability, any xMXN may redeem up to it (fungible), never beyond
        uint256 l = _mintVia(alice, 100e6, alice);
        vm.expectRevert(abi.encodeWithSelector(MoveAMM.ExceedsLiability.selector, l, l + 1));
        amm.quote(false, l + 1);
        _redeem(bob, l);
        (uint256 r, uint256 liab, uint256 eq,,,) = amm.state();
        assertEq(liab, 0);
        assertGt(r, 5_000e6 - 1, "equity buffer intact");
        assertEq(eq, 5_000e6);
    }

    function test_donationsIgnored() public {
        _mintVia(alice, 100e6, alice);
        _ousd(bob, 1_000e6);
        vm.prank(bob);
        IERC20(address(ousd)).transfer(address(amm), 1_000e6);
        (uint256 r,,,,,) = amm.state();
        assertEq(r, 100e6);
    }

    // ------------------------------------------------------------ solvency under peso appreciation

    /// 1,000 OUSD minted at 20 + 250 OUSD equity → 125% at 20, 100% at 16, then NAV redemptions below that.
    function test_pesoAppreciationCoverageAndNavRedemption() public {
        _equity(250e6);
        // mint 1,000 USD in 100-USD chunks (avoids size impact distorting the example)
        for (uint256 i; i < 10; i++) _mintVia(alice, 100e6, alice);
        (uint256 r, uint256 l,, uint256 cov,,) = amm.state();
        assertEq(r, 1_250e6);
        assertApproxEqAbs(cov, 12_530, 10); // ~125% (+fees, −impact)

        _setFx(16e8);
        (,,, cov,,) = amm.state();
        assertApproxEqAbs(cov, 10_024, 10); // ~100%

        // below 100%: mint breaker
        _setFx(12_8e7);
        (,,, cov,,) = amm.state();
        assertLt(cov, 10_000);
        _ousd(bob, 100e6);
        vm.startPrank(bob);
        IERC20(address(ousd)).approve(address(amm), 100e6);
        vm.expectRevert();
        amm.swapOusdForXmxn(100e6, 0, bob);
        vm.stopPrank();

        // NAV redemption: everyone gets the same pro-rata haircut; coverage doesn't fall for those who stay
        uint256 chunk = l / 20;
        (uint256 q,,,) = amm.quote(false, chunk);
        uint256 atMid = chunk * 1e8 / 12_8e7;
        assertLt(q, atMid * cov / 10_000 + 1);
        uint256 covBefore = cov;
        _redeem(alice, chunk);
        (,,, uint256 covAfter,,) = amm.state();
        assertGe(covAfter + 1, covBefore, "redeemers don't worsen coverage for the rest (no run advantage)");
    }

    function test_reserveNeverOverdrawn_redeemEverythingUnderStress() public {
        vm.prank(admin);
        amm.setParams(20, 250_000e6, 10_000e6, 10_000, 2_000_000e6, 30); // no daily cap for this test
        for (uint256 i; i < 10; i++) _mintVia(alice, 100e6, alice);
        _setFx(14e8); // severe appreciation, no equity
        uint256 bal = xmxn.balanceOf(alice);
        uint256 paid;
        while (bal > 0) {
            uint256 chunk = bal > 2_000e6 ? 2_000e6 : bal;
            paid += _redeem(alice, chunk);
            bal -= chunk;
            vm.warp(block.timestamp + 2 days); // let the rate-limit bucket fully drain
            _setFx(14e8);
        }
        (uint256 r, uint256 l,,,,) = amm.state();
        assertEq(l, 0);
        assertLe(paid, 1_000e6);
        assertEq(IERC20(address(ousd)).balanceOf(address(amm)), r, "books match balance");
    }

    function test_bucketIsStrictNoFloor() public {
        _mintVia(alice, 100e6, alice); // R = 100 OUSD → C = 25 OUSD, no floor
        (,,,,, uint256 cap) = amm.state();
        assertEq(cap, 25e6);
        uint256 bal = xmxn.balanceOf(alice);
        vm.expectRevert(); // ~99 OUSD out > 25
        amm.quote(false, bal);
    }

    function test_dailyRedeemCap() public {
        for (uint256 i; i < 10; i++) _mintVia(alice, 1_000e6, alice); // reserve 10,000
        // 25% of reserve per 24h = 2,500 OUSD
        uint256 x = xmxn.balanceOf(alice);
        _redeem(alice, 40_000e6); // ~1,980 OUSD
        vm.startPrank(alice);
        IERC20(address(xmxn)).approve(address(amm), 20_000e6);
        vm.expectRevert(); // RedeemCapExceeded
        amm.swapXmxnForOusd(20_000e6, 0, alice);
        vm.stopPrank();
        // leaky bucket: after 12h half the capacity has refilled
        vm.warp(block.timestamp + 12 hours);
        vm.prank(admin);
        fx.setPrice(PX_20);
        (,,,, uint256 used, uint256 cap) = amm.state();
        assertApproxEqAbs(used, 1_980e6 - cap / 2, 10e6); // cap shrinks slightly with the reserve
        _redeem(alice, 20_000e6);
        assertLt(xmxn.balanceOf(alice), x);
    }

    function test_quoteRevertsWhilePaused() public {
        vm.prank(admin);
        amm.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        amm.quote(true, 10e6);
    }

    function test_equityWithdrawGate() public {
        _equity(500e6);
        for (uint256 i; i < 10; i++) _mintVia(alice, 100e6, alice);
        // ~150% coverage; target is 120%: can take ~300 out, not 400
        vm.startPrank(admin);
        vm.expectRevert();
        amm.withdrawEquity(400e6, admin);
        amm.withdrawEquity(250e6, admin);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert();
        amm.withdrawEquity(1, alice);
    }

    function test_pause() public {
        vm.prank(admin);
        amm.pause();
        _ousd(alice, 10e6);
        vm.startPrank(alice);
        IERC20(address(ousd)).approve(address(amm), 10e6);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        amm.swapOusdForXmxn(10e6, 0, alice);
        vm.stopPrank();
    }

    function test_liabilityCeiling() public {
        vm.prank(admin);
        amm.setParams(20, 250_000e6, 10_000e6, 2_500, 1_000e6, 30);
        vm.expectRevert();
        amm.quote(true, 100e6); // ~1,996 xMXN > 1,000 ceiling
    }

    /// invariant-style: supply = vault debt + AMM liability, and the AMM's books match its OUSD balance
    function testFuzz_supplyAndBooks(uint64 a, uint64 b, uint64 c) public {
        uint256 mintUsd = bound(a, 1e6, 5_000e6);
        uint256 cdp = bound(b, 1e6, 13_000e6);
        _mintVia(alice, mintUsd, alice);
        _open(bob, address(ousd), 1_000e6, cdp);
        (, uint256 l,,,,) = amm.state();
        uint256 r1 = bound(c, 0, l);
        if (r1 > 0) {
            vm.startPrank(bob);
            IERC20(address(xmxn)).approve(address(amm), r1);
            try amm.swapXmxnForOusd(r1, 0, bob) {} catch {}
            vm.stopPrank();
        }
        (uint256 r, uint256 l2,,,,) = amm.state();
        (, uint256 vd) = vault.totals(address(ousd));
        uint256 burnedFromCdp = l - l2; // xMXN the AMM bought back (from bob's CDP-minted coins)
        assertEq(xmxn.totalSupply(), vd + l2, "supply = CDP debt + AMM liability");
        assertEq(IERC20(address(ousd)).balanceOf(address(amm)), r);
        burnedFromCdp;
    }
}
