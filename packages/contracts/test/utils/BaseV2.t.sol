// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20Factory} from "tempo-std/interfaces/ITIP20Factory.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {FXOracleAdapter} from "../../src/FXOracleAdapter.sol";
import {IPriceFeed} from "../../src/v2/IPriceFeed.sol";
import {FixedPriceFeed} from "../../src/v2/FixedPriceFeed.sol";
import {ERC4626PriceFeed} from "../../src/v2/ERC4626PriceFeed.sol";
import {AdminPriceFeed} from "../../src/v2/AdminPriceFeed.sol";
import {StakedOUSD} from "../../src/v2/StakedOUSD.sol";
import {DemoRWA} from "../../src/v2/DemoRWA.sol";
import {MultiCollateralVault} from "../../src/v2/MultiCollateralVault.sol";
import {MoveAMM} from "../../src/v2/MoveAMM.sol";
import {MercadoFactoryV2} from "../../src/v2/MercadoFactoryV2.sol";

/// v2 fixture on Tempo's REAL TIP-20 precompiles (network = "tempo"): OUSD stand-in + xMXN v2 are TIP-20s;
/// sOUSD / tTBILL are plain ERC-20s (demo tokens).
abstract contract BaseV2 is Test {
    ITIP20Factory constant TIP20_FACTORY = ITIP20Factory(0x20Fc000000000000000000000000000000000000);
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    uint256 constant PX_20 = 20e8;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address liquidator = makeAddr("liquidator");

    ITIP20 ousd;
    ITIP20 xmxn;
    FXOracleAdapter fx;
    FixedPriceFeed ousdFeed;
    StakedOUSD sousd;
    ERC4626PriceFeed sousdFeed;
    DemoRWA tbill;
    AdminPriceFeed tbillFeed;
    MultiCollateralVault vault;
    MoveAMM amm;
    MercadoFactoryV2 factory;

    function setUp() public virtual {
        vm.warp(1_760_000_000);
        vm.startPrank(admin);
        ousd = ITIP20(TIP20_FACTORY.createToken("Test OUSD", "OUSD", "USD", PATH_USD, admin, bytes32("ousd2")));
        ITIP20RolesAuth(address(ousd)).grantRole(ousd.ISSUER_ROLE(), admin);
        fx = new FXOracleAdapter(admin, PX_20);
        factory = new MercadoFactoryV2(admin);
        xmxn = ITIP20(factory.createToken("Mercado Synthetic Peso v2 (testnet)", "xMXN", "MXN", PATH_USD, bytes32("xmxn2")));
        vault = new MultiCollateralVault(admin, xmxn, IPriceFeed(address(fx)));
        amm = new MoveAMM(admin, IERC20(address(ousd)), xmxn, IPriceFeed(address(fx)));
        factory.lockIssuers(address(vault), address(amm));

        ousdFeed = new FixedPriceFeed(1e8, "OUSD assumed $1.00 (testnet)");
        sousd = new StakedOUSD(IERC20(address(ousd)), admin, 500); // 5% mock APR
        sousdFeed = new ERC4626PriceFeed(sousd, ousdFeed);
        tbill = new DemoRWA("Demo tokenized T-bill (testnet, not a security)", "tTBILL", admin, 100_000e6);
        tbillFeed = new AdminPriceFeed(admin, "tTBILL demo price", 100e8, 1 days, 50e8, 150e8, 200);

        vault.addCollateral(address(ousd), ousdFeed, 15_000, 13_500, 1_000, 2_000_000e6);
        vault.addCollateral(address(sousd), sousdFeed, 15_000, 13_500, 1_000, 2_000_000e6);
        vault.addCollateral(address(tbill), tbillFeed, 20_000, 17_000, 1_200, 1_000_000e6);
        vm.stopPrank();
    }

    function _ousd(address to, uint256 amount) internal {
        vm.prank(admin);
        ousd.mint(to, amount);
    }

    function _open(address user, address token, uint256 coll, uint256 debt) internal {
        if (token == address(ousd)) _ousd(user, coll);
        else if (token == address(tbill)) {
            vm.prank(admin);
            tbill.mint(user, coll);
        }
        vm.startPrank(user);
        IERC20(token).approve(address(vault), coll);
        vault.depositCollateral(token, coll);
        if (debt > 0) vault.mint(token, debt);
        vm.stopPrank();
    }
}
