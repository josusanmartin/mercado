// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Deployed} from "./Deployed.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {SwapDesk} from "../src/SwapDesk.sol";
import {FXOracleAdapter} from "../src/FXOracleAdapter.sol";

/// @notice On-chain FX stress demo on the shared MOCK oracle, restored within the same run:
///   1. pause the SwapDesk (nobody can trade at the stressed rate)
///   2. a fresh throwaway account opens a dedicated ~160% position (100 OUSD)
///   3. DEPLOYER (the liquidator) mints the xMXN it will need from its own 500% position
///   4. forceSet the oracle to STRESS_PRICE (default 14.00 MXN/USD: the peso appreciates; position → 112%,
///      below 135% but still solvent, so the liquidator gets the full 10% bonus)
///   5. DEPLOYER liquidates the full debt (Liquidated event)
///   6. forceSet back to the pre-stress price, 7. unpause the desk (only if this script paused it)
///   set -a; source ../../.env.local; set +a
///   forge script script/StressDemo.s.sol --rpc-url moderato --broadcast --slow
/// Env (optional): STRESS_PRICE (8dp, default 14e8), STRESS_COLLATERAL (6dp, default 100e6)
contract StressDemo is Deployed {
    address constant PATH_USD = 0x20C0000000000000000000000000000000000000;
    address constant ALPHA_USD = 0x20C0000000000000000000000000000000000001;

    function run() external {
        _load();
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        uint256 stressPx = vm.envOr("STRESS_PRICE", uint256(14e8));
        uint256 coll = vm.envOr("STRESS_COLLATERAL", uint256(100e6));
        // fresh throwaway key for the dedicated position (testnet only, holds ~nothing after the run)
        uint256 stressPk = uint256(keccak256(abi.encode("mercado.stress", deployerPk, block.timestamp))) % (2 ** 255);
        address stressor = vm.addr(stressPk);

        FXOracleAdapter fx = FXOracleAdapter(oracle);
        CollateralVault v = CollateralVault(vault);
        SwapDesk desk = SwapDesk(swapDesk);
        uint256 prePx = fx.mxnPerUsd();
        uint256 debt = coll * prePx / 1e8 * 10_000 / 16_000; // 160%
        bool pausedHere = !desk.paused();
        console.log("stressor", stressor);
        console.log("pre-stress px / stress px", prePx, stressPx);

        vm.startBroadcast(deployerPk);
        fx.forceSet(prePx); // make sure the feed is fresh before we start
        if (pausedHere) desk.pause();
        IERC20(ousd).transfer(stressor, coll);
        IERC20(PATH_USD).transfer(stressor, 5e6); // fee tokens
        IERC20(ALPHA_USD).transfer(stressor, 5e6);
        // liquidator funds: deployer's own 500% position
        uint256 liqColl = debt * 5 * 1e8 / prePx + 1;
        IERC20(ousd).approve(vault, liqColl);
        v.depositCollateral(liqColl);
        v.mint(debt);
        vm.stopBroadcast();

        vm.startBroadcast(stressPk);
        IERC20(ousd).approve(vault, coll);
        v.depositCollateral(coll);
        v.mint(debt);
        vm.stopBroadcast();

        vm.startBroadcast(deployerPk);
        fx.forceSet(stressPx);
        IERC20(xmxn).approve(vault, debt);
        v.liquidate(stressor, debt);
        fx.forceSet(prePx);
        if (pausedHere) desk.unpause();
        vm.stopBroadcast();

        console.log("liquidated debt (xMXN 6dp)", debt);
        console.log(string.concat("STRESS_BORROWER=", vm.toString(stressor)));
        console.log(string.concat("STRESS_LIQUIDATOR=", vm.toString(deployer)));
    }
}
