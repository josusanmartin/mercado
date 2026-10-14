// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title CreditPool: lender-funded, undercollateralized xMXN advances (TESTNET PROTOTYPE)
/// @notice Separate from the CDP vault. Lenders supply xMXN; borrowers draw against a short-lived EIP-712
///         eligibility attestation signed by the backend. The underwriting behind it is an illustrative
///         heuristic on Demo Uber Data, NOT a validated credit model. Repayment is manual (there is no
///         automatic payout deduction), and there is no guaranteed yield.
/// @dev EIP-712 domain: name "MercadoCreditPool", version "1", chainId, verifyingContract = this pool.
///      Typed struct: Eligibility(address borrower,uint256 maxAmount,uint256 expiry,uint256 nonce,bytes32 dataHash)
///        - borrower: must equal msg.sender
///        - maxAmount: cap on the borrower's outstanding PRINCIPAL after this draw (6dp xMXN)
///        - expiry: unix seconds, inclusive
///        - nonce: single use per borrower (replays revert)
///        - dataHash: hash of the off-chain income report/score inputs (no PII on-chain)
///      Fee: `feeBps` flat, added to debt at borrow time and realized for lenders only when repaid.
///      Repayments pay the fee first, then principal.
///      Lender accounting is share-based: claim = shares * totalAssets / totalShares, where
///      totalAssets = cash + outstanding principal (unrealized fees are excluded). Lenders can only withdraw
///      idle cash, never xMXN currently lent out. Cash is tracked internally, so direct transfers are ignored.
contract CreditPool is Ownable2Step, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant ELIGIBILITY_TYPEHASH =
        keccak256("Eligibility(address borrower,uint256 maxAmount,uint256 expiry,uint256 nonce,bytes32 dataHash)");
    uint256 internal constant BPS = 10_000;

    struct Loan {
        uint256 principal;
        uint256 fee; // unpaid fee
    }

    IERC20 public immutable xmxn;
    address public attestationSigner;
    uint256 public feeBps = 200; // 2% flat
    uint256 public perUserCap = 1_500e6; // max outstanding principal per borrower
    uint256 public maxUtilizationBps = 8_000; // outstanding principal <= 80% of totalAssets

    uint256 public cash; // idle xMXN
    uint256 public outstandingPrincipal;
    uint256 public totalBorrowed; // cumulative principal ever lent
    uint256 public realizedFees; // cumulative fees repaid
    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;
    mapping(address => Loan) public loans;
    mapping(address => mapping(uint256 => bool)) internal _nonceUsed;

    event Supplied(address indexed lender, uint256 amount);
    event Withdrawn(address indexed lender, uint256 amount);
    event Borrowed(address indexed borrower, uint256 amount, uint256 fee, uint256 nonce, bytes32 dataHash);
    event Repaid(address indexed borrower, uint256 amount, uint256 remainingDebt);
    event AttestationSignerUpdated(address signer);
    event ParamsUpdated(uint256 feeBps, uint256 perUserCap, uint256 maxUtilizationBps);

    error ZeroAmount();
    error InvalidSigner();
    error AttestationExpired(uint256 expiry);
    error NonceAlreadyUsed(uint256 nonce);
    error ExceedsAttestedMax(uint256 principalAfter, uint256 maxAmount);
    error ExceedsUserCap(uint256 principalAfter, uint256 cap);
    error ExceedsUtilization(uint256 outstandingAfter, uint256 limit);
    error InsufficientLiquidity(uint256 available, uint256 requested);
    error ExceedsLenderBalance(uint256 claim, uint256 requested);
    error RepayExceedsDebt(uint256 debt, uint256 requested);
    error InvalidParams();

    constructor(address owner_, IERC20 xmxn_, address attestationSigner_)
        Ownable(owner_)
        EIP712("MercadoCreditPool", "1")
    {
        if (attestationSigner_ == address(0)) revert InvalidSigner();
        xmxn = xmxn_;
        attestationSigner = attestationSigner_;
        emit AttestationSignerUpdated(attestationSigner_);
    }

    // ---------------------------------------------------------------- lenders

    function supply(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 assets = totalAssets();
        uint256 shares = totalShares == 0 || assets == 0 ? amount : Math.mulDiv(amount, totalShares, assets);
        if (shares == 0) revert ZeroAmount();
        totalShares += shares;
        sharesOf[msg.sender] += shares;
        cash += amount;
        xmxn.safeTransferFrom(msg.sender, address(this), amount);
        emit Supplied(msg.sender, amount);
    }

    /// @notice Withdraw up to your claim, limited to idle cash (never funds currently lent out).
    function withdrawAvailable(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > cash) revert InsufficientLiquidity(cash, amount);
        uint256 claim = lenderBalance(msg.sender);
        if (amount > claim) revert ExceedsLenderBalance(claim, amount);
        uint256 shares = Math.mulDiv(amount, totalShares, totalAssets(), Math.Rounding.Ceil);
        if (shares > sharesOf[msg.sender]) shares = sharesOf[msg.sender];
        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        cash -= amount;
        xmxn.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- borrowers

    function borrow(
        uint256 amount,
        uint256 maxAmount,
        uint256 expiry,
        uint256 nonce,
        bytes32 dataHash,
        bytes calldata signature
    ) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > expiry) revert AttestationExpired(expiry);
        if (_nonceUsed[msg.sender][nonce]) revert NonceAlreadyUsed(nonce);
        _verifySignature(msg.sender, maxAmount, expiry, nonce, dataHash, signature);
        _checkLimits(msg.sender, amount, maxAmount);

        _nonceUsed[msg.sender][nonce] = true;
        Loan storage loan = loans[msg.sender];
        uint256 fee = Math.mulDiv(amount, feeBps, BPS, Math.Rounding.Ceil);
        loan.principal += amount;
        loan.fee += fee;
        outstandingPrincipal += amount;
        totalBorrowed += amount;
        cash -= amount;
        xmxn.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount, fee, nonce, dataHash);
    }

    /// @notice Repay `amount` of your debt (fee first, then principal). Needs a prior xMXN approve.
    function repay(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Loan storage loan = loans[msg.sender];
        uint256 debt = loan.principal + loan.fee;
        if (amount > debt) revert RepayExceedsDebt(debt, amount);
        uint256 feePart = amount < loan.fee ? amount : loan.fee;
        uint256 principalPart = amount - feePart;
        loan.fee -= feePart;
        loan.principal -= principalPart;
        realizedFees += feePart;
        outstandingPrincipal -= principalPart;
        cash += amount;
        xmxn.safeTransferFrom(msg.sender, address(this), amount);
        emit Repaid(msg.sender, amount, debt - amount);
    }

    function _verifySignature(
        address borrower,
        uint256 maxAmount,
        uint256 expiry,
        uint256 nonce,
        bytes32 dataHash,
        bytes calldata signature
    ) internal view {
        bytes32 digest = eligibilityDigest(borrower, maxAmount, expiry, nonce, dataHash);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != attestationSigner) revert InvalidSigner();
    }

    function _checkLimits(address borrower, uint256 amount, uint256 maxAmount) internal view {
        uint256 principalAfter = loans[borrower].principal + amount;
        if (principalAfter > maxAmount) revert ExceedsAttestedMax(principalAfter, maxAmount);
        if (principalAfter > perUserCap) revert ExceedsUserCap(principalAfter, perUserCap);
        if (amount > cash) revert InsufficientLiquidity(cash, amount);
        uint256 outstandingAfter = outstandingPrincipal + amount;
        uint256 limit = Math.mulDiv(totalAssets(), maxUtilizationBps, BPS);
        if (outstandingAfter > limit) revert ExceedsUtilization(outstandingAfter, limit);
    }

    // ---------------------------------------------------------------- views

    function eligibilityDigest(address borrower, uint256 maxAmount, uint256 expiry, uint256 nonce, bytes32 dataHash)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(ELIGIBILITY_TYPEHASH, borrower, maxAmount, expiry, nonce, dataHash)));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Principal + unpaid fee.
    function getDebt(address borrower) external view returns (uint256) {
        Loan memory l = loans[borrower];
        return l.principal + l.fee;
    }

    function availableLiquidity() external view returns (uint256) {
        return cash;
    }

    /// @notice Idle cash plus outstanding principal (what lenders collectively have a claim on).
    function totalAssets() public view returns (uint256) {
        return cash + outstandingPrincipal;
    }

    /// @notice A lender's claim: principal plus their share of realized fees.
    function lenderBalance(address lender) public view returns (uint256) {
        if (totalShares == 0) return 0;
        return Math.mulDiv(sharesOf[lender], totalAssets(), totalShares);
    }

    /// @return totalSupplied total lender claims (= totalAssets)
    /// @return totalBorrowed_ cumulative principal ever lent
    /// @return outstanding principal currently lent out
    /// @return realizedFees_ cumulative fees repaid to the pool
    function stats()
        external
        view
        returns (uint256 totalSupplied, uint256 totalBorrowed_, uint256 outstanding, uint256 realizedFees_)
    {
        return (totalAssets(), totalBorrowed, outstandingPrincipal, realizedFees);
    }

    function nonceUsed(address borrower, uint256 nonce) external view returns (bool) {
        return _nonceUsed[borrower][nonce];
    }

    // ---------------------------------------------------------------- owner

    function setAttestationSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert InvalidSigner();
        attestationSigner = signer;
        emit AttestationSignerUpdated(signer);
    }

    function setParams(uint256 feeBps_, uint256 perUserCap_, uint256 maxUtilizationBps_) external onlyOwner {
        if (feeBps_ > 2_000 || perUserCap_ == 0 || maxUtilizationBps_ == 0 || maxUtilizationBps_ > BPS) {
            revert InvalidParams();
        }
        feeBps = feeBps_;
        perUserCap = perUserCap_;
        maxUtilizationBps = maxUtilizationBps_;
        emit ParamsUpdated(feeBps_, perUserCap_, maxUtilizationBps_);
    }
}
