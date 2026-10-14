// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title MercadoCard: spend xMXN at Mercado demo merchants with a virtual card (TESTNET)
/// @notice Real on-chain card controls and settlement; only the card network/PAN is simulated (no Visa/Mastercard,
///         no physical card, works only at allowlisted Mercado demo merchants).
///         - holders issue virtual cards with a daily spend limit, and can freeze/unfreeze them
///         - an allowlisted merchant terminal charges a card ONLY with the holder's EIP-712 tap signature
///           (binds card, merchant, amount, merchant reference, single-use nonce, deadline)
///         - xMXN moves holder → merchant via transferFrom (the holder's approve to this contract is a second cap)
///         - merchants can refund up to what they charged
/// @dev Daily limit = CALENDAR DAY in Mexico City (fixed UTC−6, no DST), the way a "límite diario" works:
///      spentToday is the actual spend since 00:00 CDMX and resets at that midnight. A charge is blocked once
///      today's spend + amount > dailyLimit. A refund reduces spentToday only for a charge made the same day.
///      EIP-712 domain: name "MercadoCard", version "1", chainId, verifyingContract = this.
///      Tap(uint256 cardId,address holder,address merchant,uint256 amount,bytes32 merchantRef,uint256 nonce,uint256 deadline)
///      The tap signature is MANDATORY: an allowlisted merchant alone can never pull funds.
contract MercadoCard is Ownable2Step, ReentrancyGuard, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant TAP_TYPEHASH =
        keccak256("Tap(uint256 cardId,address holder,address merchant,uint256 amount,bytes32 merchantRef,uint256 nonce,uint256 deadline)");
    uint256 public constant MAX_DAILY_LIMIT = 100_000e6; // xMXN per card per calendar day
    int256 public constant TZ_OFFSET = -6 hours; // America/Mexico_City, fixed UTC−6 (no DST since 2022)

    struct Card {
        address holder;
        uint64 issuedAt;
        bool frozen;
        uint256 dailyLimit;
        uint256 spent; // actual spend on `day`
        uint256 day; // CDMX calendar day index of `spent`
    }

    struct Charge {
        uint256 cardId;
        address merchant;
        uint256 amount;
        uint256 refunded;
        bytes32 merchantRef;
        uint256 day; // CDMX calendar day of the charge
    }

    struct Merchant {
        bool active;
        string name;
    }

    IERC20 public immutable xmxn;
    uint256 public cardCount;
    uint256 public chargeCount;
    uint256 public totalSpent;
    uint256 public totalRefunded;
    uint256 public merchantCount;

    mapping(uint256 => Card) internal _cards;
    mapping(address => uint256[]) internal _cardsOf;
    mapping(uint256 => Charge) public charges;
    mapping(address => Merchant) internal _merchants;
    mapping(uint256 cardId => mapping(uint256 nonce => bool)) public nonceUsed;

    event CardIssued(uint256 indexed cardId, address indexed holder, uint256 dailyLimit);
    event CardLimitUpdated(uint256 indexed cardId, uint256 dailyLimit);
    event CardFrozen(uint256 indexed cardId, bool frozen);
    event CardCharged(
        uint256 indexed chargeId, uint256 indexed cardId, address indexed merchant, address holder, uint256 amount, bytes32 merchantRef
    );
    event CardRefunded(uint256 indexed chargeId, uint256 indexed cardId, address indexed merchant, address holder, uint256 amount);
    event MerchantSet(address indexed merchant, bool active, string name);

    error NotHolder();
    error UnknownCard(uint256 cardId);
    error CardIsFrozen(uint256 cardId);
    error NotMerchant(address caller);
    error InvalidLimit();
    error ZeroAmount();
    error TapExpired(uint256 deadline);
    error TapReplayed(uint256 nonce);
    error BadTapSignature();
    error OverDailyLimit(uint256 spentAfter, uint256 dailyLimit);
    error RefundTooLarge(uint256 refundable, uint256 requested);
    error NotChargeMerchant();

    constructor(address owner_, IERC20 xmxn_) Ownable(owner_) EIP712("MercadoCard", "1") {
        xmxn = xmxn_;
    }

    // ---------------------------------------------------------------- holder

    function issueCard(uint256 dailyLimit) external whenNotPaused returns (uint256 cardId) {
        if (dailyLimit == 0 || dailyLimit > MAX_DAILY_LIMIT) revert InvalidLimit();
        cardId = ++cardCount;
        _cards[cardId] = Card(msg.sender, uint64(block.timestamp), false, dailyLimit, 0, today());
        _cardsOf[msg.sender].push(cardId);
        emit CardIssued(cardId, msg.sender, dailyLimit);
    }

    function setDailyLimit(uint256 cardId, uint256 dailyLimit) external {
        Card storage c = _holderCard(cardId);
        if (dailyLimit == 0 || dailyLimit > MAX_DAILY_LIMIT) revert InvalidLimit();
        c.dailyLimit = dailyLimit;
        emit CardLimitUpdated(cardId, dailyLimit);
    }

    function setFrozen(uint256 cardId, bool frozen) external {
        _holderCard(cardId).frozen = frozen;
        emit CardFrozen(cardId, frozen);
    }

    // ---------------------------------------------------------------- merchant

    /// @notice Charge `amount` xMXN to `cardId`, authorized by the holder's tap signature over exactly these terms.
    function charge(uint256 cardId, uint256 amount, bytes32 merchantRef, uint256 nonce, uint256 deadline, bytes calldata tapSig)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 chargeId)
    {
        address holder = _authorize(cardId, amount, merchantRef, nonce, deadline, tapSig);
        chargeId = ++chargeCount;
        charges[chargeId] = Charge(cardId, msg.sender, amount, 0, merchantRef, today());
        totalSpent += amount;
        xmxn.safeTransferFrom(holder, msg.sender, amount);
        emit CardCharged(chargeId, cardId, msg.sender, holder, amount, merchantRef);
    }

    /// @dev all checks + effects for a charge by msg.sender (the terminal); returns the holder
    function _authorize(uint256 cardId, uint256 amount, bytes32 merchantRef, uint256 nonce, uint256 deadline, bytes calldata tapSig)
        internal
        returns (address holder)
    {
        if (!_merchants[msg.sender].active) revert NotMerchant(msg.sender);
        Card storage c = _cards[cardId];
        holder = c.holder;
        if (holder == address(0)) revert UnknownCard(cardId);
        if (c.frozen) revert CardIsFrozen(cardId);
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert TapExpired(deadline);
        if (nonceUsed[cardId][nonce]) revert TapReplayed(nonce);
        _checkTap(tapDigest(cardId, holder, msg.sender, amount, merchantRef, nonce, deadline), tapSig, holder);
        uint256 d = today();
        uint256 spentAfter = (c.day == d ? c.spent : 0) + amount;
        if (spentAfter > c.dailyLimit) revert OverDailyLimit(spentAfter, c.dailyLimit);
        nonceUsed[cardId][nonce] = true;
        c.spent = spentAfter;
        c.day = d;
    }

    function _checkTap(bytes32 digest, bytes calldata tapSig, address holder) internal pure {
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, tapSig);
        if (err != ECDSA.RecoverError.NoError || signer != holder) revert BadTapSignature();
    }

    /// @notice The charging merchant returns up to the charged amount to the holder (merchant approves this contract).
    function refund(uint256 chargeId, uint256 amount) external nonReentrant {
        Charge storage ch = charges[chargeId];
        if (ch.merchant != msg.sender) revert NotChargeMerchant();
        if (amount == 0) revert ZeroAmount();
        uint256 refundable = ch.amount - ch.refunded;
        if (amount > refundable) revert RefundTooLarge(refundable, amount);
        ch.refunded += amount;
        totalRefunded += amount;
        Card storage c = _cards[ch.cardId];
        // same-day refund gives the limit back; older refunds return funds only
        if (ch.day == today() && c.day == ch.day) c.spent = c.spent > amount ? c.spent - amount : 0;
        address holder = c.holder;
        xmxn.safeTransferFrom(msg.sender, holder, amount);
        emit CardRefunded(chargeId, ch.cardId, msg.sender, holder, amount);
    }

    // ---------------------------------------------------------------- owner

    function setMerchant(address terminal, bool active, string calldata name) external onlyOwner {
        Merchant storage m = _merchants[terminal];
        if (active && !m.active) merchantCount++;
        if (!active && m.active) merchantCount--;
        m.active = active;
        m.name = name;
        emit MerchantSet(terminal, active, name);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------- views

    function tapDigest(
        uint256 cardId,
        address holder,
        address merchant_,
        uint256 amount,
        bytes32 merchantRef,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(TAP_TYPEHASH, cardId, holder, merchant_, amount, merchantRef, nonce, deadline)));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    struct CardView {
        address holder;
        uint64 issuedAt;
        bool frozen;
        uint256 dailyLimit;
        uint256 spentToday; // actual spend since 00:00 CDMX
        uint256 availableToday;
        uint16 last4; // DEMO number tail, not a PAN
        uint256 resetsAt; // next 00:00 CDMX (unix seconds)
    }

    function getCard(uint256 cardId) external view returns (CardView memory v) {
        Card storage c = _cards[cardId];
        v.holder = c.holder;
        v.issuedAt = c.issuedAt;
        v.frozen = c.frozen;
        v.dailyLimit = c.dailyLimit;
        uint256 d = today();
        v.spentToday = c.day == d ? c.spent : 0;
        v.resetsAt = dayStart(d + 1);
        v.availableToday = c.dailyLimit > v.spentToday ? c.dailyLimit - v.spentToday : 0;
        v.last4 = demoLast4(cardId);
    }

    function cardsOf(address holder) external view returns (uint256[] memory) {
        return _cardsOf[holder];
    }

    function merchant(address m) external view returns (bool active, string memory name) {
        return (_merchants[m].active, _merchants[m].name);
    }

    /// @notice DEMO card number tail (not a real PAN): derived from the card id.
    function demoLast4(uint256 cardId) public view returns (uint16) {
        return uint16(uint256(keccak256(abi.encode(address(this), cardId))) % 10_000);
    }

    function stats() external view returns (uint256 cardsIssued, uint256 spent, uint256 refunded, uint256 merchants, uint256 chargesCount) {
        return (cardCount, totalSpent, totalRefunded, merchantCount, chargeCount);
    }

    // ---------------------------------------------------------------- internal

    function _holderCard(uint256 cardId) internal view returns (Card storage c) {
        c = _cards[cardId];
        if (c.holder == address(0)) revert UnknownCard(cardId);
        if (c.holder != msg.sender) revert NotHolder();
    }

    /// @notice Current calendar-day index in Mexico City (UTC−6).
    function today() public view returns (uint256) {
        return uint256(int256(block.timestamp) + TZ_OFFSET) / 1 days;
    }

    /// @notice Unix time of 00:00 CDMX on day index `d`.
    function dayStart(uint256 d) public pure returns (uint256) {
        return uint256(int256(d * 1 days) - TZ_OFFSET);
    }

}
