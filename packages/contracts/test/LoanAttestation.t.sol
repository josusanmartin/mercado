// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Base} from "./utils/Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CreditPool} from "../src/CreditPool.sol";

/// CreditPool: EIP-712 eligibility, replay protection, caps, liquidity, lender withdrawals.
/// Local, real TIP-20 precompiles (network = "tempo").
contract LoanAttestationTest is Base {
    CreditPool pool;
    uint256 signerPk = 0xA11CE5;
    address signer;
    address lender = makeAddr("lender");
    address lender2 = makeAddr("lender2");
    address driver = makeAddr("driver");
    bytes32 constant DATA = keccak256("demo-uber-steady");

    function setUp() public override {
        super.setUp();
        signer = vm.addr(signerPk);
        pool = new CreditPool(admin, IERC20(address(xmxn)), signer);
        _open(lender, 1_000e6, 10_000e6);
        vm.startPrank(lender);
        xmxn.approve(address(pool), type(uint256).max);
        pool.supply(10_000e6);
        vm.stopPrank();
        _open(driver, 100e6, 0); // driver needs no collateral for the pool; vault position only for repay funds
    }

    function _sign(uint256 pk, address pool_, address borrower, uint256 maxAmount, uint256 expiry, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(pool.ELIGIBILITY_TYPEHASH(), borrower, maxAmount, expiry, nonce, DATA));
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("MercadoCreditPool"),
                keccak256("1"),
                block.chainid,
                pool_
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function _borrow(address who, uint256 amount, uint256 maxAmount, uint256 nonce) internal {
        uint256 expiry = block.timestamp + 15 minutes;
        bytes memory sig = _sign(signerPk, address(pool), who, maxAmount, expiry, nonce);
        vm.prank(who);
        pool.borrow(amount, maxAmount, expiry, nonce, DATA, sig);
    }

    // ------------------------------------------------------------ happy path

    function test_domainMatchesManualEncoding() public view {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("MercadoCreditPool"),
                keccak256("1"),
                block.chainid,
                address(pool)
            )
        );
        assertEq(pool.domainSeparator(), domain);
    }

    function test_borrowAndRepayWithFee() public {
        _borrow(driver, 1_000e6, 1_500e6, 1);
        assertEq(xmxn.balanceOf(driver), 1_000e6);
        assertEq(pool.getDebt(driver), 1_020e6); // 2% fee added to debt
        assertTrue(pool.nonceUsed(driver, 1));
        (uint256 supplied, uint256 borrowed, uint256 outstanding, uint256 fees) = pool.stats();
        assertEq(supplied, 10_000e6);
        assertEq(borrowed, 1_000e6);
        assertEq(outstanding, 1_000e6);
        assertEq(fees, 0);
        assertEq(pool.availableLiquidity(), 9_000e6);

        // driver gets 20 xMXN extra (from own vault position) and repays in two steps
        vm.startPrank(driver);
        vault.mint(20e6);
        xmxn.approve(address(pool), 1_020e6);
        pool.repay(500e6); // fee first: 20 fee + 480 principal
        assertEq(pool.getDebt(driver), 520e6);
        pool.repay(520e6);
        vm.stopPrank();
        assertEq(pool.getDebt(driver), 0);
        (supplied,, outstanding, fees) = pool.stats();
        assertEq(outstanding, 0);
        assertEq(fees, 20e6);
        assertEq(supplied, 10_020e6);
        assertEq(pool.lenderBalance(lender), 10_020e6, "lender earns realized fee");
    }

    function test_cannotRepayMoreThanDebt() public {
        _borrow(driver, 100e6, 1_500e6, 1);
        vm.startPrank(driver);
        vault.mint(50e6);
        xmxn.approve(address(pool), 150e6);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.RepayExceedsDebt.selector, 102e6, 103e6));
        pool.repay(103e6);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ attestation failures

    function test_invalidSignerReverts() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(0xBAD, address(pool), driver, 1_500e6, expiry, 1);
        vm.prank(driver);
        vm.expectRevert(CreditPool.InvalidSigner.selector);
        pool.borrow(100e6, 1_500e6, expiry, 1, DATA, sig);
    }

    function test_garbageSignatureReverts() public {
        vm.prank(driver);
        vm.expectRevert(CreditPool.InvalidSigner.selector);
        pool.borrow(100e6, 1_500e6, block.timestamp + 1, 1, DATA, hex"1234");
    }

    function test_wrongBorrowerReverts() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerPk, address(pool), driver, 1_500e6, expiry, 1);
        vm.prank(bob); // bob replays the driver's attestation
        vm.expectRevert(CreditPool.InvalidSigner.selector);
        pool.borrow(100e6, 1_500e6, expiry, 1, DATA, sig);
    }

    function test_tamperedFieldsRevert() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerPk, address(pool), driver, 500e6, expiry, 1);
        vm.startPrank(driver);
        vm.expectRevert(CreditPool.InvalidSigner.selector);
        pool.borrow(100e6, 1_500e6, expiry, 1, DATA, sig); // inflated maxAmount
        vm.expectRevert(CreditPool.InvalidSigner.selector);
        pool.borrow(100e6, 500e6, expiry + 1, 1, DATA, sig); // extended expiry
        vm.expectRevert(CreditPool.InvalidSigner.selector);
        pool.borrow(100e6, 500e6, expiry, 1, bytes32(0), sig); // different data hash
        vm.stopPrank();
    }

    function test_otherPoolDomainReverts() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerPk, address(0xDEAD), driver, 1_500e6, expiry, 1);
        vm.prank(driver);
        vm.expectRevert(CreditPool.InvalidSigner.selector);
        pool.borrow(100e6, 1_500e6, expiry, 1, DATA, sig);
    }

    function test_otherChainReverts() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerPk, address(pool), driver, 1_500e6, expiry, 1); // signed for this chain
        vm.chainId(1);
        vm.prank(driver);
        vm.expectRevert(CreditPool.InvalidSigner.selector);
        pool.borrow(100e6, 1_500e6, expiry, 1, DATA, sig);
    }

    function test_expiredAttestationReverts() public {
        uint256 expiry = block.timestamp + 15 minutes;
        bytes memory sig = _sign(signerPk, address(pool), driver, 1_500e6, expiry, 1);
        vm.warp(expiry + 1);
        vm.prank(driver);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.AttestationExpired.selector, expiry));
        pool.borrow(100e6, 1_500e6, expiry, 1, DATA, sig);
    }

    function test_replayedNonceReverts() public {
        uint256 expiry = block.timestamp + 15 minutes;
        bytes memory sig = _sign(signerPk, address(pool), driver, 1_500e6, expiry, 7);
        vm.startPrank(driver);
        pool.borrow(100e6, 1_500e6, expiry, 7, DATA, sig);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.NonceAlreadyUsed.selector, 7));
        pool.borrow(100e6, 1_500e6, expiry, 7, DATA, sig);
        vm.stopPrank();
    }

    function test_rotatedSignerInvalidatesOldAttestations() public {
        uint256 expiry = block.timestamp + 15 minutes;
        bytes memory sig = _sign(signerPk, address(pool), driver, 1_500e6, expiry, 1);
        vm.prank(admin);
        pool.setAttestationSigner(makeAddr("newSigner"));
        vm.prank(driver);
        vm.expectRevert(CreditPool.InvalidSigner.selector);
        pool.borrow(100e6, 1_500e6, expiry, 1, DATA, sig);
    }

    // ------------------------------------------------------------ caps & liquidity

    function test_exceedsAttestedMaxReverts() public {
        _borrow(driver, 400e6, 500e6, 1);
        uint256 expiry = block.timestamp + 15 minutes;
        bytes memory sig = _sign(signerPk, address(pool), driver, 500e6, expiry, 2);
        vm.prank(driver);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.ExceedsAttestedMax.selector, 600e6, 500e6));
        pool.borrow(200e6, 500e6, expiry, 2, DATA, sig); // principal after = 600 > 500
    }

    function test_exceedsPerUserCapReverts() public {
        uint256 expiry = block.timestamp + 15 minutes;
        bytes memory sig = _sign(signerPk, address(pool), driver, 5_000e6, expiry, 1);
        vm.prank(driver);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.ExceedsUserCap.selector, 1_501e6, 1_500e6));
        pool.borrow(1_501e6, 5_000e6, expiry, 1, DATA, sig);
    }

    function test_utilizationCapReverts() public {
        // 10,000 supplied → at most 8,000 outstanding. Five borrowers x 1,500 = 7,500; the sixth can take 500.
        for (uint256 i; i < 5; i++) {
            _borrow(address(uint160(0x1000 + i)), 1_500e6, 1_500e6, 1);
        }
        address sixth = address(0x2000);
        assertEq(pool.borrowCapacity(sixth, 1_500e6), 500e6);
        assertEq(pool.availableLiquidity(), 2_500e6);
        uint256 expiry = block.timestamp + 15 minutes;
        bytes memory sig = _sign(signerPk, address(pool), sixth, 1_500e6, expiry, 1);
        vm.prank(sixth);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.ExceedsUtilization.selector, 8_000e6 + 1, 8_000e6));
        pool.borrow(500e6 + 1, 1_500e6, expiry, 1, DATA, sig);
        vm.prank(sixth);
        pool.borrow(500e6, 1_500e6, expiry, 1, DATA, sig);
    }

    function test_insufficientLiquidityReverts() public {
        vm.prank(admin);
        pool.setParams(200, 50_000e6, 10_000); // allow 100% utilization to isolate the cash check
        uint256 expiry = block.timestamp + 15 minutes;
        bytes memory sig = _sign(signerPk, address(pool), driver, 20_000e6, expiry, 1);
        vm.prank(driver);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.InsufficientLiquidity.selector, 10_000e6, 10_001e6));
        pool.borrow(10_001e6, 20_000e6, expiry, 1, DATA, sig);
    }

    function test_borrowCapacityMatchesContractLimits() public {
        // R-006 regression: cash alone is not borrow capacity
        CreditPool small = new CreditPool(admin, IERC20(address(xmxn)), signer);
        _open(lender2, 100e6, 75e6);
        vm.startPrank(lender2);
        xmxn.approve(address(small), 75e6);
        small.supply(75e6);
        vm.stopPrank();
        assertEq(small.availableLiquidity(), 75e6);
        assertEq(small.borrowCapacity(driver, 70e6), 60e6);
        assertEq(small.maxBorrowable(driver), 60e6);
    }

    // ------------------------------------------------------------ lenders

    function test_lenderCannotWithdrawLentFunds() public {
        vm.prank(admin);
        pool.setParams(200, 10_000e6, 10_000);
        _borrow(driver, 6_000e6, 10_000e6, 1);
        assertEq(pool.availableLiquidity(), 4_000e6);
        assertEq(pool.lenderBalance(lender), 10_000e6);
        vm.prank(lender);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.InsufficientLiquidity.selector, 4_000e6, 4_000e6 + 1));
        pool.withdrawAvailable(4_000e6 + 1);
        vm.prank(lender);
        pool.withdrawAvailable(4_000e6);
        assertEq(pool.lenderBalance(lender), 6_000e6);
    }

    function test_lenderCannotWithdrawOthersShare() public {
        _open(lender2, 1_000e6, 1_000e6);
        vm.startPrank(lender2);
        xmxn.approve(address(pool), 1_000e6);
        pool.supply(1_000e6);
        vm.expectRevert(abi.encodeWithSelector(CreditPool.ExceedsLenderBalance.selector, 1_000e6, 1_000e6 + 1));
        pool.withdrawAvailable(1_000e6 + 1);
        pool.withdrawAvailable(1_000e6);
        vm.stopPrank();
        assertEq(pool.lenderBalance(lender2), 0);
        assertEq(pool.lenderBalance(lender), 10_000e6);
    }

    function test_feesSplitProRata() public {
        _open(lender2, 1_000e6, 10_000e6);
        vm.startPrank(lender2);
        xmxn.approve(address(pool), 10_000e6);
        pool.supply(10_000e6);
        vm.stopPrank();
        _borrow(driver, 1_000e6, 1_500e6, 1);
        vm.startPrank(driver);
        vault.mint(20e6);
        xmxn.approve(address(pool), 1_020e6);
        pool.repay(1_020e6);
        vm.stopPrank();
        assertEq(pool.lenderBalance(lender), 10_010e6);
        assertEq(pool.lenderBalance(lender2), 10_010e6);
    }

    function test_directTransferIgnored() public {
        vm.prank(driver);
        vault.mint(100e6);
        vm.prank(driver);
        xmxn.transfer(address(pool), 100e6);
        assertEq(pool.availableLiquidity(), 10_000e6);
        assertEq(pool.lenderBalance(lender), 10_000e6);
    }
}
