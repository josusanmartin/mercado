// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {FXOracleAdapter} from "../src/FXOracleAdapter.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {LocalStableFactory} from "../src/LocalStableFactory.sol";
import {SwapDesk} from "../src/SwapDesk.sol";
import {CreditPool} from "../src/CreditPool.sol";

/// @notice Staged Moderato deployment. Each stage reads/writes deployments/<chainId>.json (addresses only);
///         `node script/export.mjs` then merges tx hashes from broadcast/ into packages/shared.
///
///   set -a; source ../../.env.local; set +a
///   forge script script/Deploy.s.sol --sig "core()"   --rpc-url moderato --broadcast   # oracle + factory + xMXN + vault
///   forge script script/Deploy.s.sol --sig "smoke()"  --rpc-url moderato --broadcast   # deposit→mint→repay→withdraw
///   forge script script/Deploy.s.sol --sig "swap()"   --rpc-url moderato --broadcast   # SwapDesk seeded by LP
///   forge script script/Deploy.s.sol --sig "credit()" --rpc-url moderato --broadcast   # CreditPool supplied by LENDER
contract Deploy is Script {
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    /// Tempo's faucet-issued testnet OpenUSD (no real value, not issuer-backed for our purposes)
    address constant FAUCET_OUSD = 0x20c0000000000000000000006a37DA5C996874BE;
    uint256 constant INITIAL_PX = 20e8; // 20.00 MXN/USD, mock admin feed, not a quotation

    // demo sizing (6dp)
    // LP and lender positions sit at 400% so the FX stress demo (20 → 13) never brings them near 135%.
    uint256 constant LP_COLLATERAL = 4_000e6;
    uint256 constant LP_MINT = 20_000e6;
    uint256 constant DESK_OUSD = 1_000e6;
    uint256 constant DESK_XMXN = 20_000e6;
    uint256 constant LENDER_COLLATERAL = 2_000e6;
    uint256 constant LENDER_MINT = 10_000e6;
    uint256 constant POOL_SUPPLY = 10_000e6;

    string path;
    address ousd;
    address xmxn;
    address factory;
    address oracle;
    address vault;
    address swapDesk;
    address creditPool;

    function setUp() public {
        path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        if (vm.exists(path)) {
            string memory j = vm.readFile(path);
            ousd = _addr(j, ".ousd");
            xmxn = _addr(j, ".xMXN");
            factory = _addr(j, ".factory");
            oracle = _addr(j, ".oracle");
            vault = _addr(j, ".vault");
            swapDesk = _addr(j, ".swapDesk");
            creditPool = _addr(j, ".creditPool");
        }
    }

    /// Stage A: oracle, factory, xMXN (via TIP20Factory) and vault (ISSUER_ROLE granted by the factory).
    function core() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        ousd = FAUCET_OUSD;
        vm.startBroadcast(pk);
        oracle = address(new FXOracleAdapter(deployer, INITIAL_PX));
        factory = address(new LocalStableFactory(deployer));
        (xmxn, vault) = LocalStableFactory(factory).createMarket(
            "Mercado Synthetic Peso (testnet)",
            "xMXN",
            "MXN",
            PATH_USD,
            IERC20(ousd),
            FXOracleAdapter(oracle),
            keccak256("mercado.xMXN.v1")
        );
        vm.stopBroadcast();
        _save();
    }

    /// Pass A gate: a real round trip on-chain from the DEPLOYER account.
    function smoke() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        IERC20(ousd).approve(vault, 100e6);
        CollateralVault(vault).depositCollateral(100e6);
        CollateralVault(vault).mint(1_000e6);
        IERC20(xmxn).approve(vault, 1_000e6);
        CollateralVault(vault).repayAndBurn(1_000e6);
        CollateralVault(vault).withdrawCollateral(100e6);
        vm.stopBroadcast();
    }

    /// Stage B: SwapDesk (owner = DEPLOYER: pause/params/withdraw), seeded by LP. The desk's xMXN is minted
    /// through the LP's OWN vault position (separate collateral); the desk has no access to vault collateral.
    function swap() external {
        uint256 lpPk = vm.envUint("LP_PRIVATE_KEY");
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPk);
        swapDesk = address(new SwapDesk(vm.addr(deployerPk), IERC20(ousd), IERC20(xmxn), FXOracleAdapter(oracle)));
        vm.stopBroadcast();

        vm.startBroadcast(lpPk);
        IERC20(ousd).approve(vault, LP_COLLATERAL);
        CollateralVault(vault).depositCollateral(LP_COLLATERAL);
        CollateralVault(vault).mint(LP_MINT);
        IERC20(ousd).approve(swapDesk, DESK_OUSD);
        IERC20(xmxn).approve(swapDesk, DESK_XMXN);
        SwapDesk(swapDesk).seed(DESK_OUSD, DESK_XMXN);
        vm.stopBroadcast();
        _save();
    }

    /// Stage C: CreditPool (owner = DEPLOYER, signer = ATTESTATION_SIGNER), supplied by LENDER with xMXN the
    /// lender minted from its own vault position.
    function credit() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 lenderPk = vm.envUint("LENDER_PRIVATE_KEY");
        address signer = vm.envAddress("ATTESTATION_SIGNER_ADDRESS");

        vm.startBroadcast(deployerPk);
        creditPool = address(new CreditPool(vm.addr(deployerPk), IERC20(xmxn), signer));
        vm.stopBroadcast();

        vm.startBroadcast(lenderPk);
        IERC20(ousd).approve(vault, LENDER_COLLATERAL);
        CollateralVault(vault).depositCollateral(LENDER_COLLATERAL);
        CollateralVault(vault).mint(LENDER_MINT);
        IERC20(xmxn).approve(creditPool, POOL_SUPPLY);
        CreditPool(creditPool).supply(POOL_SUPPLY);
        vm.stopBroadcast();
        _save();
    }

    function _save() internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "ousd", ousd);
        vm.serializeAddress(k, "xMXN", xmxn);
        vm.serializeAddress(k, "factory", factory);
        vm.serializeAddress(k, "oracle", oracle);
        vm.serializeAddress(k, "vault", vault);
        vm.serializeAddress(k, "swapDesk", swapDesk);
        vm.serializeAddress(k, "creditPool", creditPool);
        vm.serializeAddress(k, "attestationSigner", vm.envOr("ATTESTATION_SIGNER_ADDRESS", address(0)));
        string memory out = vm.serializeAddress(k, "merchant", vm.envOr("MERCHANT_ADDRESS", address(0)));
        vm.writeJson(out, path);
        console.log("wrote", path);
    }

    function _addr(string memory j, string memory key) internal view returns (address) {
        return vm.keyExistsJson(j, key) ? vm.parseJsonAddress(j, key) : address(0);
    }
}
