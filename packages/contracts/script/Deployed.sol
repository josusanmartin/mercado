// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";

/// @dev Loads deployments/<chainId>.json for the admin scripts (env-driven, no CLI args).
abstract contract Deployed is Script {
    address ousd;
    address xmxn;
    address oracle;
    address vault;
    address swapDesk;
    address creditPool;

    function _load() internal {
        string memory j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json"));
        ousd = vm.parseJsonAddress(j, ".ousd");
        xmxn = vm.parseJsonAddress(j, ".xMXN");
        oracle = vm.parseJsonAddress(j, ".oracle");
        vault = vm.parseJsonAddress(j, ".vault");
        swapDesk = vm.parseJsonAddress(j, ".swapDesk");
        creditPool = vm.parseJsonAddress(j, ".creditPool");
    }
}
