// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {CreditPool} from "../src/CreditPool.sol";
import {IPriceFeed} from "../src/v2/IPriceFeed.sol";
import {FixedPriceFeed} from "../src/v2/FixedPriceFeed.sol";
import {ERC4626PriceFeed} from "../src/v2/ERC4626PriceFeed.sol";
import {AdminPriceFeed} from "../src/v2/AdminPriceFeed.sol";
import {StakedOUSD} from "../src/v2/StakedOUSD.sol";
import {DemoRWA} from "../src/v2/DemoRWA.sol";
import {MultiCollateralVault} from "../src/v2/MultiCollateralVault.sol";
import {MoveAMM} from "../src/v2/MoveAMM.sol";
import {MercadoFactoryV2} from "../src/v2/MercadoFactoryV2.sol";

/// @notice v2 deployment ALONGSIDE v1 (v1 untouched). Writes deployments/<chainId>.v2.json; export.mjs merges it
///         into packages/shared under the "v2" key.
///   forge script script/DeployV2.s.sol --sig "core()"   --rpc-url moderato --broadcast --slow
///   forge script script/DeployV2.s.sol --sig "seed()"   --rpc-url moderato --broadcast --slow
///   forge script script/DeployV2.s.sol --sig "credit()" --rpc-url moderato --broadcast --slow
contract DeployV2 is Script {
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);

    string path;
    address ousd;
    address fxOracle; // v1 FXOracleAdapter, shared
    address factory;
    address xmxn;
    address vault;
    address vamm;
    address creditPool;
    address ousdFeed;
    address sousd;
    address sousdFeed;
    address tbill;
    address tbillFeed;

    function setUp() public {
        string memory root = vm.projectRoot();
        string memory v1 = vm.readFile(string.concat(root, "/deployments/", vm.toString(block.chainid), ".json"));
        ousd = vm.parseJsonAddress(v1, ".ousd");
        fxOracle = vm.parseJsonAddress(v1, ".oracle");
        path = string.concat(root, "/deployments/", vm.toString(block.chainid), ".v2.json");
        if (vm.exists(path)) {
            string memory j = vm.readFile(path);
            factory = _a(j, ".factory");
            xmxn = _a(j, ".xMXN");
            vault = _a(j, ".vault");
            vamm = _a(j, ".vamm");
            creditPool = _a(j, ".creditPool");
            ousdFeed = _a(j, ".ousdFeed");
            sousd = _a(j, ".sOUSD");
            sousdFeed = _a(j, ".sOUSDFeed");
            tbill = _a(j, ".tTBILL");
            tbillFeed = _a(j, ".tTBILLFeed");
        }
    }

    /// Token, vault, AMM, feeds, demo collaterals; issuers locked to vault + AMM.
    function core() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);
        MercadoFactoryV2 f = new MercadoFactoryV2(deployer);
        factory = address(f);
        xmxn = f.createToken("Mercado Synthetic Peso v2 (testnet)", "xMXN", "MXN", PATH_USD, keccak256("mercado.xMXN.v2"));
        MultiCollateralVault v = new MultiCollateralVault(deployer, ITIP20(xmxn), IPriceFeed(fxOracle));
        MoveAMM a = new MoveAMM(deployer, IERC20(ousd), ITIP20(xmxn), IPriceFeed(fxOracle));
        (vault, vamm) = (address(v), address(a));
        f.lockIssuers(vault, vamm);

        ousdFeed = address(new FixedPriceFeed(1e8, "Testnet OUSD assumed at $1.00"));
        StakedOUSD s = new StakedOUSD(IERC20(ousd), deployer, 500); // 5% MOCK APR
        sousd = address(s);
        sousdFeed = address(new ERC4626PriceFeed(s, IPriceFeed(ousdFeed)));
        tbill = address(new DemoRWA("Demo tokenized T-bill (testnet, not a security)", "tTBILL", deployer, 1_000e6));
        tbillFeed = address(new AdminPriceFeed(deployer, "tTBILL demo price (admin)", 100e8, 1 days, 50e8, 150e8, 200));

        v.addCollateral(ousd, IPriceFeed(ousdFeed), 15_000, 13_500, 1_000, 2_000_000e6);
        v.addCollateral(sousd, IPriceFeed(sousdFeed), 15_000, 13_500, 1_000, 2_000_000e6);
        v.addCollateral(tbill, IPriceFeed(tbillFeed), 20_000, 17_000, 1_200, 1_000_000e6);

        // fund a year of mock yield for ~20k OUSD of deposits
        IERC20(ousd).approve(sousd, 1_000e6);
        s.fundYield(1_000e6);
        vm.stopBroadcast();
        _save();
    }

    /// Liquidity + demo institutional positions:
    ///  - LP: 1,000 OUSD through the AMM (Move liability), then sOUSD + tTBILL positions (Create)
    ///  - DEPLOYER: 2,500 OUSD equity buffer (so 25%-of-reserve redemptions fit demo sizes)
    ///  - DRIVER: 20 xMXN v2 float from LP
    function seed() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 lpPk = vm.envUint("LP_PRIVATE_KEY");
        address lp = vm.addr(lpPk);

        vm.startBroadcast(lpPk);
        IERC20(ousd).approve(vamm, 1_000e6);
        MoveAMM(vamm).swapOusdForXmxn(1_000e6, 0, lp);
        // institution A: staked OUSD at 300%
        IERC20(ousd).approve(sousd, 5_000e6);
        uint256 shares = StakedOUSD(sousd).deposit(5_000e6, lp);
        IERC20(sousd).approve(vault, shares);
        MultiCollateralVault(vault).depositCollateral(sousd, shares);
        MultiCollateralVault(vault).mint(sousd, 33_000e6);
        // institution B: tokenized T-bills at 400%
        DemoRWA(tbill).faucet(1_000e6);
        IERC20(tbill).approve(vault, 1_000e6);
        MultiCollateralVault(vault).depositCollateral(tbill, 1_000e6);
        MultiCollateralVault(vault).mint(tbill, 500_000e6); // 1,000 × $100 × 20 = 2,000,000 MXN of collateral → 400%
        IERC20(xmxn).transfer(vm.envAddress("DRIVER_ADDRESS"), 20e6);
        vm.stopBroadcast();

        vm.startBroadcast(deployerPk);
        IERC20(ousd).approve(vamm, 2_500e6);
        MoveAMM(vamm).addEquity(2_500e6);
        vm.stopBroadcast();
    }

    /// CreditPool v2 over xMXN v2, supplied by LENDER from its own 400% OUSD position.
    function credit() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 lenderPk = vm.envUint("LENDER_PRIVATE_KEY");
        address signer = vm.envAddress("ATTESTATION_SIGNER_ADDRESS");
        vm.startBroadcast(deployerPk);
        creditPool = address(new CreditPool(vm.addr(deployerPk), IERC20(xmxn), signer));
        vm.stopBroadcast();
        vm.startBroadcast(lenderPk);
        IERC20(ousd).approve(vault, 2_000e6);
        MultiCollateralVault(vault).depositCollateral(ousd, 2_000e6);
        MultiCollateralVault(vault).mint(ousd, 10_000e6);
        IERC20(xmxn).approve(creditPool, 10_000e6);
        CreditPool(creditPool).supply(10_000e6);
        vm.stopBroadcast();
        _save();
    }

    function _save() internal {
        string memory k = "v2";
        vm.serializeAddress(k, "factory", factory);
        vm.serializeAddress(k, "xMXN", xmxn);
        vm.serializeAddress(k, "vault", vault);
        vm.serializeAddress(k, "vamm", vamm);
        vm.serializeAddress(k, "creditPool", creditPool);
        vm.serializeAddress(k, "fxOracle", fxOracle);
        vm.serializeAddress(k, "ousd", ousd);
        vm.serializeAddress(k, "ousdFeed", ousdFeed);
        vm.serializeAddress(k, "sOUSD", sousd);
        vm.serializeAddress(k, "sOUSDFeed", sousdFeed);
        vm.serializeAddress(k, "tTBILL", tbill);
        string memory out = vm.serializeAddress(k, "tTBILLFeed", tbillFeed);
        vm.writeJson(out, path);
        console.log("wrote", path);
    }

    function _a(string memory j, string memory key) internal view returns (address) {
        return vm.keyExistsJson(j, key) ? vm.parseJsonAddress(j, key) : address(0);
    }
}
