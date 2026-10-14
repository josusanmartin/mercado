// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Deployed} from "./Deployed.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {SwapDesk} from "../src/SwapDesk.sol";
import {CreditPool} from "../src/CreditPool.sol";
import {FXOracleAdapter} from "../src/FXOracleAdapter.sol";

/// @notice Idempotent demo reset (run via script/demo-reset). Every step is a no-op when already in the target
///         state, so it's safe to run before every take.
///   1. oracle  → forceSet 20.00 (fresh timestamp)              [DEPLOYER]
///   2. desk    → unpause; top up to ≥ 1,000 OUSD / 20,000 xMXN [DEPLOYER, LP]
///   3. pool    → idle cash ≥ 10,000 xMXN                        [LENDER, from its own 400% position]
///   4. driver  → advance + vault debt repaid, vault emptied, xMXN = 20  [LP funds repayment, DRIVER repays]
///      sender / recipient → leftover xMXN swept back to LP; sender keeps its OUSD
///      LP      → ratio ≥ 300% (tops up collateral); surplus xMXN repays LP's own vault debt
/// xMXN for any shortfall is minted by LP from its own vault position, never from anyone else's collateral.
contract DemoReset is Deployed {
    uint256 constant PX = 20e8;
    uint256 constant DESK_OUSD = 1_000e6;
    uint256 constant DESK_XMXN = 20_000e6;
    uint256 constant POOL_CASH = 10_000e6;
    uint256 constant DRIVER_XMXN = 20e6;
    uint256 constant LP_MIN_RATIO_BPS = 30_000;
    uint256 constant LP_FLOAT = 5_000e6; // xMXN LP keeps on hand; the rest repays its own vault debt

    uint256 deployerPk;
    uint256 lpPk;
    address lp;

    function run() external {
        _load();
        deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        lpPk = vm.envUint("LP_PRIVATE_KEY");
        lp = vm.addr(lpPk);

        _oracleAndDesk();
        _pool();
        _driver();
        _sweep(vm.envUint("SENDER_PRIVATE_KEY"), "sender");
        _sweep(vm.envUint("RECIPIENT_PRIVATE_KEY"), "recipient");
        _lpHealth();
        console.log("DEMO_RESET=ok");
    }

    // ---------------------------------------------------------------- steps

    function _oracleAndDesk() internal {
        SwapDesk desk = SwapDesk(swapDesk);
        vm.startBroadcast(deployerPk);
        FXOracleAdapter(oracle).forceSet(PX);
        if (desk.paused()) desk.unpause();
        vm.stopBroadcast();

        (uint256 rO, uint256 rX) = desk.reserves();
        uint256 needO = DESK_OUSD > rO ? DESK_OUSD - rO : 0;
        uint256 needX = DESK_XMXN > rX ? DESK_XMXN - rX : 0;
        if (needO == 0 && needX == 0) return;
        _lpEnsureXmxn(needX);
        vm.startBroadcast(lpPk);
        if (needO > 0) IERC20(ousd).approve(swapDesk, needO);
        if (needX > 0) IERC20(xmxn).approve(swapDesk, needX);
        desk.seed(needO, needX);
        vm.stopBroadcast();
        console.log("desk seeded OUSD/xMXN", needO, needX);
    }

    function _pool() internal {
        uint256 cash = CreditPool(creditPool).availableLiquidity();
        if (cash >= POOL_CASH) return;
        uint256 need = POOL_CASH - cash;
        uint256 lenderPk = vm.envUint("LENDER_PRIVATE_KEY");
        vm.startBroadcast(lenderPk);
        _mintAt400(need);
        IERC20(xmxn).approve(creditPool, need);
        CreditPool(creditPool).supply(need);
        vm.stopBroadcast();
        console.log("pool supplied", need);
    }

    function _driver() internal {
        uint256 driverPk = vm.envUint("DRIVER_PRIVATE_KEY");
        address driver = vm.addr(driverPk);
        uint256 poolDebt = CreditPool(creditPool).getDebt(driver);
        CollateralVault.Position memory p = CollateralVault(vault).getPosition(driver);
        uint256 bal = IERC20(xmxn).balanceOf(driver);
        uint256 needed = poolDebt + p.debt + DRIVER_XMXN;
        if (bal < needed) _lpTransfer(driver, needed - bal);

        vm.startBroadcast(driverPk);
        if (poolDebt > 0) {
            IERC20(xmxn).approve(creditPool, poolDebt);
            CreditPool(creditPool).repay(poolDebt);
        }
        if (p.debt > 0) {
            IERC20(xmxn).approve(vault, p.debt);
            CollateralVault(vault).repayAndBurn(p.debt);
        }
        if (p.collateral > 0) CollateralVault(vault).withdrawCollateral(p.collateral);
        uint256 left = IERC20(xmxn).balanceOf(driver);
        if (left > DRIVER_XMXN) IERC20(xmxn).transfer(lp, left - DRIVER_XMXN);
        vm.stopBroadcast();
        if (poolDebt + p.debt > 0) console.log("driver repaid (pool, vault)", poolDebt, p.debt);
    }

    function _sweep(uint256 pk, string memory who) internal {
        address a = vm.addr(pk);
        uint256 bal = IERC20(xmxn).balanceOf(a);
        if (bal == 0) return;
        vm.startBroadcast(pk);
        IERC20(xmxn).transfer(lp, bal);
        vm.stopBroadcast();
        console.log(string.concat(who, " xMXN swept to LP"), bal);
    }

    function _lpHealth() internal {
        CollateralVault v = CollateralVault(vault);
        uint256 bal = IERC20(xmxn).balanceOf(lp);
        CollateralVault.Position memory p = v.getPosition(lp);
        vm.startBroadcast(lpPk);
        if (bal > LP_FLOAT && p.debt > 0) {
            uint256 repay = bal - LP_FLOAT < p.debt ? bal - LP_FLOAT : p.debt;
            IERC20(xmxn).approve(vault, repay);
            v.repayAndBurn(repay);
            p.debt -= repay;
        }
        // collateral needed for LP_MIN_RATIO at 20.00 (rounded up)
        uint256 required = (p.debt * LP_MIN_RATIO_BPS * 1e8 + PX * 10_000 - 1) / (PX * 10_000);
        if (p.collateral < required) {
            uint256 add = required - p.collateral;
            IERC20(ousd).approve(vault, add);
            v.depositCollateral(add);
        }
        vm.stopBroadcast();
    }

    // ---------------------------------------------------------------- helpers

    /// Caller (inside a broadcast) deposits OUSD at 400% and mints `amount` xMXN to itself.
    function _mintAt400(uint256 amount) internal {
        uint256 coll = amount * 4 * 1e8 / PX + 1;
        IERC20(ousd).approve(vault, coll);
        CollateralVault(vault).depositCollateral(coll);
        CollateralVault(vault).mint(amount);
    }

    /// Make sure LP holds at least `amount` xMXN, minting the shortfall from its own position.
    function _lpEnsureXmxn(uint256 amount) internal {
        uint256 bal = IERC20(xmxn).balanceOf(lp);
        if (bal >= amount) return;
        vm.startBroadcast(lpPk);
        _mintAt400(amount - bal);
        vm.stopBroadcast();
    }

    function _lpTransfer(address to, uint256 amount) internal {
        _lpEnsureXmxn(amount);
        vm.startBroadcast(lpPk);
        IERC20(xmxn).transfer(to, amount);
        vm.stopBroadcast();
    }
}
