// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MultiCollateralVault} from "../src/v2/MultiCollateralVault.sol";
import {MoveAMM} from "../src/v2/MoveAMM.sol";
import {SwapDesk} from "../src/SwapDesk.sol";
import {FXOracleAdapter} from "../src/FXOracleAdapter.sol";

/// @notice v2 FX stress demo on the shared admin-relayed oracle, restored within the same run:
///   1. pause the v2 MoveAMM and the v1 SwapDesk (nobody trades or redeems at the stressed rate)
///   2. a fresh account opens a dedicated ~160% OUSD position in the v2 MultiCollateralVault
///   3. DEPLOYER mints the xMXN it needs from its own 500% v2 position
///   4. forceSet the oracle to STRESS_BPS of the current rate (default 70%: peso +43% → position ~112%, solvent)
///   5. log the AMM coverage under stress, liquidate the full debt (Liquidated event)
///   6. forceSet back to the pre-stress rate, unpause both venues
///   set -a; source ../../.env.local; set +a
///   forge script script/StressDemoV2.s.sol --rpc-url moderato --broadcast --slow
/// Env (optional): STRESS_BPS (default 7000), STRESS_COLLATERAL (6dp OUSD, default 100e6)
contract StressDemoV2 is Script {
    address constant PATH_USD = 0x20C0000000000000000000000000000000000000;
    address constant ALPHA_USD = 0x20C0000000000000000000000000000000000001;

    address ousd;
    address xmxn;
    MultiCollateralVault vault;
    MoveAMM amm;
    FXOracleAdapter fx;
    SwapDesk desk;
    uint256 deployerPk;
    address deployer;
    uint256 coll;
    uint256 stressPk;
    address stressor;
    uint256 prePx;
    uint256 stressPx;
    uint256 debt;
    bool pauseAmm;
    bool pauseDesk;

    function _load() internal {
        string memory root = vm.projectRoot();
        string memory v1 = vm.readFile(string.concat(root, "/deployments/", vm.toString(block.chainid), ".json"));
        string memory v2 = vm.readFile(string.concat(root, "/deployments/", vm.toString(block.chainid), ".v2.json"));
        ousd = vm.parseJsonAddress(v2, ".ousd");
        xmxn = vm.parseJsonAddress(v2, ".xMXN");
        vault = MultiCollateralVault(vm.parseJsonAddress(v2, ".vault"));
        amm = MoveAMM(vm.parseJsonAddress(v2, ".vamm"));
        fx = FXOracleAdapter(vm.parseJsonAddress(v2, ".fxOracle"));
        desk = SwapDesk(vm.parseJsonAddress(v1, ".swapDesk"));
        deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        deployer = vm.addr(deployerPk);
        coll = vm.envOr("STRESS_COLLATERAL", uint256(100e6));
        stressPk = uint256(keccak256(abi.encode("mercado.stress.v2", deployerPk, block.timestamp))) % (2 ** 255);
        stressor = vm.addr(stressPk);
        prePx = fx.mxnPerUsd();
        stressPx = prePx * vm.envOr("STRESS_BPS", uint256(7_000)) / 10_000;
        debt = coll * prePx / 1e8 * 10_000 / 16_000; // 160%
        pauseAmm = !amm.paused();
        pauseDesk = !desk.paused();
    }

    function run() external {
        _load();
        (,,, uint256 covBefore,,) = amm.state();
        console.log("pre-stress / stress px (8dp)", prePx, stressPx);
        console.log("AMM coverage before (bps)", covBefore);

        vm.startBroadcast(deployerPk);
        if (pauseAmm) amm.pause();
        if (pauseDesk) desk.pause();
        IERC20(ousd).transfer(stressor, coll);
        IERC20(PATH_USD).transfer(stressor, 5e6); // fee tokens
        IERC20(ALPHA_USD).transfer(stressor, 5e6);
        uint256 liqColl = debt * 5 * 1e8 / prePx + 1; // liquidator's own 500% position
        IERC20(ousd).approve(address(vault), liqColl);
        vault.depositCollateral(ousd, liqColl);
        vault.mint(ousd, debt);
        vm.stopBroadcast();

        vm.startBroadcast(stressPk);
        IERC20(ousd).approve(address(vault), coll);
        vault.depositCollateral(ousd, coll);
        vault.mint(ousd, debt);
        vm.stopBroadcast();

        vm.startBroadcast(deployerPk);
        fx.forceSet(stressPx);
        vm.stopBroadcast();
        (,,, uint256 covStress,,) = amm.state();
        console.log("AMM coverage under stress (bps)", covStress);
        console.log("position ratio under stress (bps)", vault.collateralRatio(stressor, ousd));

        vm.startBroadcast(deployerPk);
        IERC20(xmxn).approve(address(vault), debt);
        vault.liquidate(stressor, ousd, debt);
        fx.forceSet(prePx);
        if (pauseAmm) amm.unpause();
        if (pauseDesk) desk.unpause();
        vm.stopBroadcast();

        console.log("liquidated debt (xMXN 6dp)", debt);
        console.log(string.concat("STRESS_BORROWER=", vm.toString(stressor)));
        console.log(string.concat("STRESS_LIQUIDATOR=", vm.toString(deployer)));
    }
}
