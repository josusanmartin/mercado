// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPriceFeed} from "./IPriceFeed.sol";
import {MoveAMM} from "./MoveAMM.sol";

/// @title InvestDesk: buy/sell the DEMO tokenized T-bill (tTBILL) for OUSD or xMXN (TESTNET)
/// @notice Real on-chain trades against the desk's own finite inventory, priced from the tTBILL admin feed
///         (a demo price source, not a market) with a spread. The desk never mints tTBILL. xMXN trades route
///         atomically through the v2 MoveAMM (xMXN → OUSD redeem before a buy, OUSD → xMXN mint after a sell).
///         Demo tokenized T-bill: not a security, no Treasury backing, no guaranteed return.
/// @dev Units: OUSD and tTBILL 6dp; feed 8dp USD per tTBILL.
///        buy:  tbillOut = ousdIn × 1e8 / px × (1 − spread)      sell: ousdOut = tbillIn × px / 1e8 × (1 − spread)
///      Reserves are tracked internally (donations ignored). A stale/paused feed reverts. Max per trade in USD.
///      Buy-back only (review R-042): the desk buys back at most what each address bought from it (`bought`), so
///      free faucet tTBILL can't be sold in to drain the OUSD reserve. Quotes revert while paused (R-043).
contract InvestDesk is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant PX = 1e8;

    IERC20 public immutable ousd;
    IERC20 public immutable tbill;
    IERC20 public immutable xmxn;
    IPriceFeed public immutable feed;
    MoveAMM public immutable amm;

    uint256 public spreadBps = 25;
    uint256 public maxTradeUsd = 25_000e6;
    uint256 public reserveOusd;
    uint256 public reserveTbill;
    /// @notice tTBILL each address bought from this desk and hasn't sold back (the most it can sell here)
    mapping(address => uint256) public bought;

    event Bought(address indexed user, bool withXmxn, uint256 payIn, uint256 ousdUsed, uint256 tbillOut, uint256 fee, uint256 px);
    event Sold(address indexed user, bool forXmxn, uint256 tbillIn, uint256 ousdOut, uint256 received, uint256 fee, uint256 px);
    event Seeded(address indexed from, uint256 ousd, uint256 tbill);
    event Withdrawn(address indexed to, uint256 ousd, uint256 tbill);
    event ParamsUpdated(uint256 spreadBps, uint256 maxTradeUsd);

    error ZeroAmount();
    error TradeTooLarge(uint256 usd, uint256 max);
    error InsufficientInventory(uint256 available, uint256 needed);
    error Slippage(uint256 out, uint256 minOut);
    error InvalidParams();
    error ExceedsBoughtBalance(uint256 bought, uint256 requested);

    constructor(address owner_, IERC20 ousd_, IERC20 tbill_, IERC20 xmxn_, IPriceFeed feed_, MoveAMM amm_) Ownable(owner_) {
        if (feed_.decimals() != 8) revert InvalidParams();
        (ousd, tbill, xmxn, feed, amm) = (ousd_, tbill_, xmxn_, feed_, amm_);
    }

    // ---------------------------------------------------------------- quotes (revert like the trade would)

    function quoteBuy(uint256 ousdIn) public view returns (uint256 tbillOut, uint256 fee, uint256 px) {
        if (paused()) revert EnforcedPause();
        if (ousdIn == 0) revert ZeroAmount();
        if (ousdIn > maxTradeUsd) revert TradeTooLarge(ousdIn, maxTradeUsd);
        (px,) = feed.price();
        uint256 gross = Math.mulDiv(ousdIn, PX, px);
        fee = Math.mulDiv(gross, spreadBps, BPS, Math.Rounding.Ceil);
        tbillOut = gross - fee;
        if (tbillOut == 0) revert ZeroAmount();
        if (tbillOut > reserveTbill) revert InsufficientInventory(reserveTbill, tbillOut);
    }

    function quoteSell(uint256 tbillIn) public view returns (uint256 ousdOut, uint256 fee, uint256 px) {
        if (paused()) revert EnforcedPause();
        if (tbillIn == 0) revert ZeroAmount();
        (px,) = feed.price();
        uint256 gross = Math.mulDiv(tbillIn, px, PX);
        if (gross > maxTradeUsd) revert TradeTooLarge(gross, maxTradeUsd);
        fee = Math.mulDiv(gross, spreadBps, BPS, Math.Rounding.Ceil);
        ousdOut = gross - fee;
        if (ousdOut == 0) revert ZeroAmount();
        if (ousdOut > reserveOusd) revert InsufficientInventory(reserveOusd, ousdOut);
    }

    /// @notice xMXN → (MoveAMM redeem) → OUSD → tTBILL
    function quoteBuyWithXmxn(uint256 xmxnIn) external view returns (uint256 tbillOut, uint256 ousdUsed, uint256 px) {
        (ousdUsed,,,) = amm.quote(false, xmxnIn);
        (tbillOut,, px) = quoteBuy(ousdUsed);
    }

    /// @notice tTBILL → OUSD → (MoveAMM mint) → xMXN
    function quoteSellForXmxn(uint256 tbillIn) external view returns (uint256 xmxnOut, uint256 ousdOut, uint256 px) {
        (ousdOut,, px) = quoteSell(tbillIn);
        (xmxnOut,,,) = amm.quote(true, ousdOut);
    }

    // ---------------------------------------------------------------- trades

    function buy(uint256 ousdIn, uint256 minTbillOut) external nonReentrant whenNotPaused returns (uint256 tbillOut) {
        ousd.safeTransferFrom(msg.sender, address(this), ousdIn);
        tbillOut = _buy(ousdIn, minTbillOut, false, ousdIn);
    }

    function sell(uint256 tbillIn, uint256 minOusdOut) external nonReentrant whenNotPaused returns (uint256 ousdOut) {
        uint256 fee;
        uint256 px;
        (ousdOut, fee, px) = quoteSell(tbillIn);
        if (ousdOut < minOusdOut) revert Slippage(ousdOut, minOusdOut);
        _spendBought(tbillIn);
        reserveTbill += tbillIn;
        reserveOusd -= ousdOut;
        tbill.safeTransferFrom(msg.sender, address(this), tbillIn);
        ousd.safeTransfer(msg.sender, ousdOut);
        emit Sold(msg.sender, false, tbillIn, ousdOut, ousdOut, fee, px);
    }

    /// @notice Pay in xMXN: redeemed to OUSD through the MoveAMM (its own reserve and limits apply), then bought.
    function buyWithXmxn(uint256 xmxnIn, uint256 minTbillOut) external nonReentrant whenNotPaused returns (uint256 tbillOut) {
        xmxn.safeTransferFrom(msg.sender, address(this), xmxnIn);
        xmxn.forceApprove(address(amm), xmxnIn);
        uint256 ousdIn = amm.swapXmxnForOusd(xmxnIn, 0, address(this)); // slippage bound by minTbillOut
        tbillOut = _buy(ousdIn, minTbillOut, true, xmxnIn);
    }

    /// @notice Receive xMXN: sold for OUSD, then minted to xMXN through the MoveAMM straight to the seller.
    function sellForXmxn(uint256 tbillIn, uint256 minXmxnOut) external nonReentrant whenNotPaused returns (uint256 xmxnOut) {
        (uint256 ousdOut, uint256 fee, uint256 px) = quoteSell(tbillIn);
        _spendBought(tbillIn);
        reserveTbill += tbillIn;
        reserveOusd -= ousdOut;
        tbill.safeTransferFrom(msg.sender, address(this), tbillIn);
        ousd.forceApprove(address(amm), ousdOut);
        xmxnOut = amm.swapOusdForXmxn(ousdOut, minXmxnOut, msg.sender);
        emit Sold(msg.sender, true, tbillIn, ousdOut, xmxnOut, fee, px);
    }

    function _buy(uint256 ousdIn, uint256 minTbillOut, bool withXmxn, uint256 payIn) internal returns (uint256 tbillOut) {
        uint256 fee;
        uint256 px;
        (tbillOut, fee, px) = quoteBuy(ousdIn);
        if (tbillOut < minTbillOut) revert Slippage(tbillOut, minTbillOut);
        reserveOusd += ousdIn;
        reserveTbill -= tbillOut;
        bought[msg.sender] += tbillOut;
        tbill.safeTransfer(msg.sender, tbillOut);
        emit Bought(msg.sender, withXmxn, payIn, ousdIn, tbillOut, fee, px);
    }

    function _spendBought(uint256 tbillIn) internal {
        uint256 b = bought[msg.sender];
        if (tbillIn > b) revert ExceedsBoughtBalance(b, tbillIn);
        bought[msg.sender] = b - tbillIn;
    }

    // ---------------------------------------------------------------- inventory (owner)

    function seed(uint256 ousdAmount, uint256 tbillAmount) external onlyOwner nonReentrant {
        reserveOusd += ousdAmount;
        reserveTbill += tbillAmount;
        if (ousdAmount > 0) ousd.safeTransferFrom(msg.sender, address(this), ousdAmount);
        if (tbillAmount > 0) tbill.safeTransferFrom(msg.sender, address(this), tbillAmount);
        emit Seeded(msg.sender, ousdAmount, tbillAmount);
    }

    function withdraw(uint256 ousdAmount, uint256 tbillAmount, address to) external onlyOwner nonReentrant {
        if (ousdAmount > reserveOusd) revert InsufficientInventory(reserveOusd, ousdAmount);
        if (tbillAmount > reserveTbill) revert InsufficientInventory(reserveTbill, tbillAmount);
        reserveOusd -= ousdAmount;
        reserveTbill -= tbillAmount;
        if (ousdAmount > 0) ousd.safeTransfer(to, ousdAmount);
        if (tbillAmount > 0) tbill.safeTransfer(to, tbillAmount);
        emit Withdrawn(to, ousdAmount, tbillAmount);
    }

    function setParams(uint256 spreadBps_, uint256 maxTradeUsd_) external onlyOwner {
        if (spreadBps_ > 200 || maxTradeUsd_ == 0) revert InvalidParams();
        (spreadBps, maxTradeUsd) = (spreadBps_, maxTradeUsd_);
        emit ParamsUpdated(spreadBps_, maxTradeUsd_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function reserves() external view returns (uint256, uint256) {
        return (reserveOusd, reserveTbill);
    }
}
