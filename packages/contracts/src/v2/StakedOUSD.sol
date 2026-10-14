// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC4626, ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StakedOUSD (sOUSD): DEMO staked OUSD, an ERC-4626 vault over OUSD with admin-set mock yield (testnet)
/// @notice Yield is a mock: the owner sets an APR and funds the OUSD that pays it via `fundYield`. No real staking,
///         no real yield.
/// @dev Donation-proof, fully accounted share price. The token balance is never read:
///        totalAssets = assetsAccounted + min(assetsAccounted × apr × Δt / year, fundedReserve)
///      - Direct transfers to the vault are ignored forever (not counted in any formula).
///      - `fundYield` checkpoints BEFORE adding funds, so accrual that wasn't funded while it accrued is forfeited.
///        A late top-up can't realize hidden accrual in one block.
///      - The price can only rise, at ≤ aprBps (capped at 20%), and never beyond funded OUSD.
contract StakedOUSD is ERC4626, Ownable2Step {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_APR_BPS = 2_000;
    uint256 internal constant YEAR = 365 days;

    uint256 public assetsAccounted; // principal + realized yield
    uint256 public fundedReserve; // funded OUSD not yet realized as yield
    uint256 public checkpointAt;
    uint256 public aprBps;

    event AprUpdated(uint256 aprBps);
    event YieldFunded(address indexed from, uint256 amount);

    constructor(IERC20 ousd, address owner_, uint256 aprBps_)
        ERC20("Demo staked OUSD (mock yield, testnet)", "sOUSD")
        ERC4626(ousd)
        Ownable(owner_)
    {
        require(aprBps_ <= MAX_APR_BPS, "apr");
        aprBps = aprBps_;
        checkpointAt = block.timestamp;
    }

    function _pending() internal view returns (uint256) {
        uint256 accrued = Math.mulDiv(assetsAccounted, aprBps * (block.timestamp - checkpointAt), 10_000 * YEAR);
        return accrued < fundedReserve ? accrued : fundedReserve;
    }

    function totalAssets() public view override returns (uint256) {
        return assetsAccounted + _pending();
    }

    /// @notice Funded OUSD still available to pay future mock yield.
    function yieldReserve() external view returns (uint256) {
        return fundedReserve - _pending();
    }

    function setApr(uint256 aprBps_) external onlyOwner {
        require(aprBps_ <= MAX_APR_BPS, "apr");
        _checkpoint();
        aprBps = aprBps_;
        emit AprUpdated(aprBps_);
    }

    /// @notice Fund future mock yield. Checkpoints first: unfunded past accrual is forfeited, not back-paid.
    function fundYield(uint256 amount) external onlyOwner {
        _checkpoint();
        fundedReserve += amount;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        emit YieldFunded(msg.sender, amount);
    }

    function _checkpoint() internal {
        uint256 p = _pending();
        assetsAccounted += p;
        fundedReserve -= p;
        checkpointAt = block.timestamp;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _checkpoint();
        super._deposit(caller, receiver, assets, shares);
        assetsAccounted += assets;
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        _checkpoint();
        assetsAccounted -= assets;
        super._withdraw(caller, receiver, owner_, assets, shares);
    }
}
