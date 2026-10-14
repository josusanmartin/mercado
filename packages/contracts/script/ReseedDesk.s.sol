// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Deployed} from "./Deployed.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {SwapDesk} from "../src/SwapDesk.sol";
import {FXOracleAdapter} from "../src/FXOracleAdapter.sol";

/// @notice Top the SwapDesk back up to target reserves. The LP account supplies the inventory: OUSD from its
///         wallet, xMXN minted through its OWN vault position at 400% (never from other users' collateral).
///   set -a; source ../../.env.local; set +a
///   forge script script/ReseedDesk.s.sol --rpc-url moderato --broadcast
/// Env (optional): DESK_OUSD_TARGET, DESK_XMXN_TARGET (6dp base units; defaults 1,000 OUSD / 20,000 xMXN)
contract ReseedDesk is Deployed {
    function run() external {
        _load();
        uint256 lpPk = vm.envUint("LP_PRIVATE_KEY");
        uint256 targetO = vm.envOr("DESK_OUSD_TARGET", uint256(1_000e6));
        uint256 targetX = vm.envOr("DESK_XMXN_TARGET", uint256(20_000e6));
        (uint256 rO, uint256 rX) = SwapDesk(swapDesk).reserves();
        uint256 needO = targetO > rO ? targetO - rO : 0;
        uint256 needX = targetX > rX ? targetX - rX : 0;
        console.log("reserves OUSD/xMXN", rO, rX);
        if (needO == 0 && needX == 0) {
            console.log("desk already at target");
            return;
        }
        (uint256 px,) = FXOracleAdapter(oracle).price();
        vm.startBroadcast(lpPk);
        if (needX > 0) {
            uint256 coll = needX * 4 * 1e8 / px + 1; // 400%
            IERC20(ousd).approve(vault, coll);
            CollateralVault(vault).depositCollateral(coll);
            CollateralVault(vault).mint(needX);
            IERC20(xmxn).approve(swapDesk, needX);
        }
        if (needO > 0) IERC20(ousd).approve(swapDesk, needO);
        SwapDesk(swapDesk).seed(needO, needX);
        vm.stopBroadcast();
        console.log("seeded OUSD/xMXN", needO, needX);
    }
}
