// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MultiCollateralVault} from "../src/v2/MultiCollateralVault.sol";
import {MoveAMM} from "../src/v2/MoveAMM.sol";
import {CreditPool} from "../src/CreditPool.sol";
import {MercadoCard} from "../src/v2/MercadoCard.sol";
import {IPriceFeed} from "../src/v2/IPriceFeed.sol";

/// @notice Idempotent v2 demo reset (run via script/demo-reset). NEVER touches the FX oracle: the real
///         admin-relayed rate stays as is (fx-relay owns it). Every step is a no-op when already in the target state.
///   1. pool v2: idle cash ≥ 10,000 xMXN (LENDER mints from its own 400% OUSD position, then supplies)
///   2. driver: advance on pool v2 repaid (LP funds the repayment), driver keeps exactly 20 xMXN
///   3. cards: Familia (RECIPIENT) and Javier (DRIVER) each have a card: unfrozen, 1,000/day limit, 2,000 allowance;
///      Familia keeps ≥ 200 xMXN to spend
///   4. SENDER2: exactly 1,250 OUSD (excess back to DEPLOYER, shortfall from DEPLOYER); its xMXN swept to LP
///   5. MoveAMM: equity ≥ 2,500 OUSD; prints coverage
/// xMXN for top-ups comes from LP's balance (minting the shortfall from LP's own 400% v2 OUSD position).
contract DemoResetV2 is Script {
    uint256 constant POOL_CASH = 10_000e6;
    uint256 constant DRIVER_FLOAT = 20e6;
    uint256 constant FAMILIA_MIN = 200e6;
    uint256 constant CARD_LIMIT = 1_000e6;
    uint256 constant CARD_ALLOWANCE = 2_000e6;
    uint256 constant SENDER2_OUSD = 1_250e6;
    uint256 constant AMM_EQUITY = 2_500e6;

    address ousd;
    address xmxn;
    MultiCollateralVault vault;
    MoveAMM amm;
    CreditPool pool;
    MercadoCard card;
    IPriceFeed fx;
    uint256 deployerPk;
    uint256 lpPk;
    address lp;

    function run() external {
        string memory v2 = vm.readFile(string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".v2.json"));
        ousd = vm.parseJsonAddress(v2, ".ousd");
        xmxn = vm.parseJsonAddress(v2, ".xMXN");
        vault = MultiCollateralVault(vm.parseJsonAddress(v2, ".vault"));
        amm = MoveAMM(vm.parseJsonAddress(v2, ".vamm"));
        pool = CreditPool(vm.parseJsonAddress(v2, ".creditPool"));
        card = MercadoCard(vm.parseJsonAddress(v2, ".card"));
        fx = IPriceFeed(vm.parseJsonAddress(v2, ".fxOracle"));
        deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        lpPk = vm.envUint("LP_PRIVATE_KEY");
        lp = vm.addr(lpPk);

        _pool();
        _driver();
        _card(vm.envUint("RECIPIENT_PRIVATE_KEY"), FAMILIA_MIN, "familia");
        _card(vm.envUint("DRIVER_PRIVATE_KEY"), 0, "javier");
        _sender2();
        _amm();
        console.log("DEMO_RESET=ok");
    }

    function _pool() internal {
        uint256 cash = pool.availableLiquidity();
        if (cash >= POOL_CASH) return;
        uint256 need = POOL_CASH - cash;
        uint256 lenderPk = vm.envUint("LENDER_PRIVATE_KEY");
        vm.startBroadcast(lenderPk);
        _mintAt400(need);
        IERC20(xmxn).approve(address(pool), need);
        pool.supply(need);
        vm.stopBroadcast();
        console.log("pool v2 supplied", need);
    }

    function _driver() internal {
        uint256 driverPk = vm.envUint("DRIVER_PRIVATE_KEY");
        address driver = vm.addr(driverPk);
        uint256 debt = pool.getDebt(driver);
        uint256 bal = IERC20(xmxn).balanceOf(driver);
        if (bal < debt + DRIVER_FLOAT) _lpSend(driver, debt + DRIVER_FLOAT - bal);
        vm.startBroadcast(driverPk);
        if (debt > 0) {
            IERC20(xmxn).approve(address(pool), debt);
            pool.repay(debt);
        }
        uint256 left = IERC20(xmxn).balanceOf(driver);
        if (left > DRIVER_FLOAT) IERC20(xmxn).transfer(lp, left - DRIVER_FLOAT);
        vm.stopBroadcast();
        if (debt > 0) console.log("driver advance repaid (pool v2)", debt);
    }

    function _card(uint256 pk, uint256 minBal, string memory who) internal {
        address holder = vm.addr(pk);
        uint256 bal = IERC20(xmxn).balanceOf(holder);
        if (bal < minBal) _lpSend(holder, minBal - bal);
        uint256[] memory ids = card.cardsOf(holder);
        vm.startBroadcast(pk);
        uint256 id;
        if (ids.length == 0) {
            id = card.issueCard(CARD_LIMIT);
            console.log(string.concat(who, " card issued"), id);
        } else {
            id = ids[0];
            MercadoCard.CardView memory v = card.getCard(id);
            if (v.frozen) card.setFrozen(id, false);
            if (v.dailyLimit != CARD_LIMIT) card.setDailyLimit(id, CARD_LIMIT);
        }
        if (IERC20(xmxn).allowance(holder, address(card)) != CARD_ALLOWANCE) IERC20(xmxn).approve(address(card), CARD_ALLOWANCE);
        vm.stopBroadcast();
    }

    function _sender2() internal {
        uint256 pk = vm.envOr("SENDER2_PRIVATE_KEY", uint256(0));
        if (pk == 0) return;
        address s2 = vm.addr(pk);
        uint256 bal = IERC20(ousd).balanceOf(s2);
        if (bal > SENDER2_OUSD) {
            vm.startBroadcast(pk);
            IERC20(ousd).transfer(vm.addr(deployerPk), bal - SENDER2_OUSD);
            vm.stopBroadcast();
        } else if (bal < SENDER2_OUSD) {
            vm.startBroadcast(deployerPk);
            IERC20(ousd).transfer(s2, SENDER2_OUSD - bal);
            vm.stopBroadcast();
        }
        uint256 x = IERC20(xmxn).balanceOf(s2);
        if (x > 0) {
            vm.startBroadcast(pk);
            IERC20(xmxn).transfer(lp, x);
            vm.stopBroadcast();
        }
        console.log("sender2 OUSD set to", SENDER2_OUSD);
    }

    function _amm() internal {
        (,, uint256 equity,,,) = amm.state();
        if (equity < AMM_EQUITY) {
            vm.startBroadcast(deployerPk);
            IERC20(ousd).approve(address(amm), AMM_EQUITY - equity);
            amm.addEquity(AMM_EQUITY - equity);
            vm.stopBroadcast();
            console.log("AMM equity topped up", AMM_EQUITY - equity);
        }
        (uint256 r, uint256 l, uint256 e, uint256 c,,) = amm.state();
        console.log("AMM reserve / liability / equity", r, l, e);
        console.log("AMM coverage bps", c);
    }

    /// caller (in a broadcast) deposits OUSD at 400% in the v2 vault and mints `amount` xMXN v2 to itself
    function _mintAt400(uint256 amount) internal {
        (uint256 px,) = fx.price(); // read only, never written
        uint256 coll = amount * 4 * 1e8 / px + 1;
        IERC20(ousd).approve(address(vault), coll);
        vault.depositCollateral(ousd, coll);
        vault.mint(ousd, amount);
    }

    function _lpSend(address to, uint256 amount) internal {
        uint256 bal = IERC20(xmxn).balanceOf(lp);
        vm.startBroadcast(lpPk);
        if (bal < amount) _mintAt400(amount - bal);
        IERC20(xmxn).transfer(to, amount);
        vm.stopBroadcast();
    }
}
