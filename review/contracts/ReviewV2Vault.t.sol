// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReviewV2Move} from "./ReviewV2Move.t.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AdminPriceFeed} from "src/v2/AdminPriceFeed.sol";
import {MultiCollateralVault} from "src/v2/MultiCollateralVault.sol";

contract ReviewCollateral18 is ERC20 {
    constructor() ERC20("Review asset", "RA18") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
contract ReviewV2Vault is ReviewV2Move {
    ReviewCollateral18 asset18;
    AdminPriceFeed rwaFeed;
    function setUp() public override {
        super.setUp();
        asset18 = new ReviewCollateral18();
        rwaFeed = new AdminPriceFeed(admin,"Review mock RWA",100e8,24 hours,50e8,150e8,200);
        vm.prank(admin); cdp.addCollateral(address(asset18),rwaFeed,20_000,17_000,1_200,10_000e6);
        asset18.mint(alice,100e18);
        asset18.mint(bob,100e18);
        vm.prank(alice); asset18.approve(address(cdp),type(uint256).max);
        vm.prank(bob); asset18.approve(address(cdp),type(uint256).max);
    }
    function test_aggregateCeilingAcrossBorrowersAndLowering() public {
        vm.startPrank(alice); cdp.depositCollateral(address(asset18),100e18); cdp.mint(address(asset18),6_000e6); vm.stopPrank();
        vm.startPrank(bob); cdp.depositCollateral(address(asset18),100e18);
        vm.expectRevert(abi.encodeWithSelector(MultiCollateralVault.DebtCeilingExceeded.selector,10_001e6,10_000e6));
        cdp.mint(address(asset18),4_001e6); cdp.mint(address(asset18),4_000e6); vm.stopPrank();
        vm.prank(admin); cdp.setDebtCeiling(address(asset18),9_000e6);
        assertEq(cdp.maxMintable(alice,address(asset18)),0);
        vm.startPrank(alice); cdp.repayAndBurn(address(asset18),2_000e6); vm.stopPrank();
        assertEq(cdp.maxMintable(alice,address(asset18)),1_000e6);
        (,uint256 debt) = cdp.totals(address(asset18));
        assertEq(peso.totalSupply(), debt + amm.liability());
    }
    function test_gapDownLiquidationAndOracleIndependentRepayExit() public {
        vm.startPrank(alice); cdp.depositCollateral(address(asset18),5e18); cdp.mint(address(asset18),5_000e6); vm.stopPrank();
        vm.prank(admin); rwaFeed.forceSet(70e8);
        assertTrue(cdp.isLiquidatable(alice,address(asset18)));
        vm.prank(alice); cdp.liquidate(alice,address(asset18),1_000e6);
        vm.prank(admin); rwaFeed.setPaused(true);
        vm.prank(admin); oracle.pause();
        vm.expectRevert(); cdp.maxMintable(alice,address(asset18));
        vm.startPrank(alice); cdp.repayAndBurn(address(asset18),4_000e6);
        (uint256 coll,) = cdp.getPosition(alice,address(asset18));
        cdp.withdrawCollateral(address(asset18),coll); vm.stopPrank();
        (uint256 finalColl,uint256 finalDebt) = cdp.getPosition(alice,address(asset18));
        assertEq(finalColl,0); assertEq(finalDebt,0);
    }
    function testFuzz_exactWithdrawBound18Decimals(uint64 debtSeed,uint64 priceSeed) public {
        uint256 debt = bound(uint256(debtSeed),1,4_000e6);
        uint256 px = bound(uint256(priceSeed),50e8,150e8);
        vm.prank(admin); rwaFeed.forceSet(px);
        vm.startPrank(alice); cdp.depositCollateral(address(asset18),10e18); cdp.mint(address(asset18),debt);
        uint256 quoted = cdp.maxWithdrawable(alice,address(asset18));
        cdp.withdrawCollateral(address(asset18),quoted);
        vm.expectRevert(); cdp.withdrawCollateral(address(asset18),1); vm.stopPrank();
    }
}
