// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IHubAMM {
    function shares(address token, address provider) external view returns (uint256);
    function totalShares(address token) external view returns (uint256);
    function tokenReserves(address token) external view returns (uint256);
    function pathReserves(address token) external view returns (uint256);
}

/**
 * USYCRewards - time-based LP reward distributor.
 *
 * LPs earn USYC at 1.5%-1.7% APR on their stablecoin LP share value.
 * Accrual starts from the block timestamp when the user first snapshots.
 *
 * Rate is stored in basis points: 150 = 1.5%, 170 = 1.7%.
 * Default rate for all pairs is 150 bps. Override per token via setRewardRate().
 *
 * The contract must hold enough USYC to cover claimable rewards.
 * Fund it by calling USYC.transfer(address(this), amount) after deployment.
 */
contract USYCRewards is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usyc;
    IHubAMM public immutable hubAmm;

    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant DEFAULT_RATE_BPS = 150; // 1.5%

    // token address => annual reward rate in basis points
    mapping(address => uint256) public rewardRateBps;
    mapping(address => bool) public rewardRateConfigured;
    mapping(address => bool) public poolEnabled;

    // user => token => last checkpoint timestamp
    mapping(address => mapping(address => uint256)) public lastSnapshot;

    // user => token => accrued but unclaimed rewards (6 decimals, matches USYC)
    mapping(address => mapping(address => uint256)) public pendingRewards;

    event RewardAccrued(address indexed user, address indexed token, uint256 amount);
    event RewardClaimed(address indexed user, address indexed token, uint256 amount);
    event RewardRateSet(address indexed token, uint256 rateBps);
    event RewardPoolEnabled(address indexed token, bool enabled);
    event OwnerSnapshotSet(address indexed user, address indexed token, uint256 timestamp);
    event Funded(uint256 amount);
    event Initialized(address indexed owner, address indexed usyc, address indexed hubAmm);

    constructor(address _usyc, address _hubAmm) Ownable(msg.sender) {
        require(_usyc != address(0), "USYC required");
        require(_hubAmm != address(0), "AMM required");
        usyc = IERC20(_usyc);
        hubAmm = IHubAMM(_hubAmm);
        emit Initialized(msg.sender, _usyc, _hubAmm);
    }

    // -------------------------------------------------------------------------
    // Owner actions
    // -------------------------------------------------------------------------

    function setRewardRate(address token, uint256 rateBps) external onlyOwner {
        require(token != address(0), "token required");
        require(rateBps <= 10000, "rate > 100%");
        rewardRateBps[token] = rateBps;
        rewardRateConfigured[token] = true;
        emit RewardRateSet(token, rateBps);
    }

    function setPoolEnabled(address token, bool enabled) external onlyOwner {
        require(token != address(0), "token required");
        poolEnabled[token] = enabled;
        emit RewardPoolEnabled(token, enabled);
    }

    // Convenience: withdraw USYC from contract if needed (emergency).
    function withdrawUsyc(uint256 amount) external onlyOwner {
        usyc.safeTransfer(msg.sender, amount);
    }

    /**
     * Backdate a user's snapshot to their first-ever liquidity deposit timestamp.
     * Only callable by owner. Used once to bootstrap past LPs so they can claim
     * rewards retroactively from when they first provided liquidity.
     * Will not overwrite a snapshot that is already set.
     */
    function ownerSnapshot(address user, address token, uint256 firstDepositTimestamp) external onlyOwner {
        require(firstDepositTimestamp < block.timestamp, "timestamp in future");
        require(lastSnapshot[user][token] == 0, "snapshot already set");
        lastSnapshot[user][token] = firstDepositTimestamp;
        emit OwnerSnapshotSet(user, token, firstDepositTimestamp);
    }

    function ownerSnapshotBatch(
        address[] calldata users,
        address[] calldata tokens,
        uint256[] calldata timestamps
    ) external onlyOwner {
        require(users.length == tokens.length && tokens.length == timestamps.length, "length mismatch");
        for (uint256 i = 0; i < users.length; i++) {
            if (lastSnapshot[users[i]][tokens[i]] == 0 && timestamps[i] < block.timestamp) {
                lastSnapshot[users[i]][tokens[i]] = timestamps[i];
                emit OwnerSnapshotSet(users[i], tokens[i], timestamps[i]);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Snapshot - called externally when LP position changes
    // -------------------------------------------------------------------------

    /**
     * Checkpoint a user's accrued rewards for a given token pair.
     * Must be called before LP share changes (add/remove liquidity).
     * Anyone can call; the frontend calls it before liquidity actions.
     */
    function snapshot(address user, address token) public {
        _accrueRewards(user, token);
    }

    // -------------------------------------------------------------------------
    // Claim
    // -------------------------------------------------------------------------

    function claim(address token) external nonReentrant {
        _accrueRewards(msg.sender, token);

        uint256 amount = pendingRewards[msg.sender][token];
        require(amount > 0, "nothing to claim");

        pendingRewards[msg.sender][token] = 0;

        require(usyc.balanceOf(address(this)) >= amount, "insufficient reward balance");
        usyc.safeTransfer(msg.sender, amount);

        emit RewardClaimed(msg.sender, token, amount);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /**
     * Returns total claimable USYC for a user on a given pair.
     */
    function claimableOf(address user, address token) external view returns (uint256) {
        uint256 accrued = _computeAccrued(user, token);
        return pendingRewards[user][token] + accrued;
    }

    function rewardRate(address token) external view returns (uint256) {
        return _effectiveRewardRate(token);
    }

    function contractBalance() external view returns (uint256) {
        return usyc.balanceOf(address(this));
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _accrueRewards(address user, address token) internal {
        uint256 accrued = _computeAccrued(user, token);
        if (accrued > 0) {
            pendingRewards[user][token] += accrued;
            emit RewardAccrued(user, token, accrued);
        }

        // Set snapshot to now whether or not they had a position. This marks
        // the start of their accrual window on first call.
        lastSnapshot[user][token] = block.timestamp;
    }

    function _computeAccrued(address user, address token) internal view returns (uint256) {
        if (!poolEnabled[token]) return 0;

        uint256 snapshotTime = lastSnapshot[user][token];
        if (snapshotTime == 0) return 0;

        uint256 elapsed = block.timestamp - snapshotTime;
        if (elapsed == 0) return 0;

        uint256 userShares = hubAmm.shares(token, user);
        uint256 total = hubAmm.totalShares(token);
        if (userShares == 0 || total == 0) return 0;

        // ArcHubAMMNormalized mints LP shares in 18-decimal normalized units.
        // A balanced stable LP position has roughly one side of USD value in
        // shares, so rewards use shares * 2 as the full stablecoin position.
        // This avoids current reserves because reserves can move inside one
        // block and must not retroactively inflate rewards.
        uint256 userTvl = (userShares * 2) / 1e12;
        if (userTvl == 0) return 0;

        uint256 rate = _effectiveRewardRate(token);
        return (userTvl * rate * elapsed) / (10000 * SECONDS_PER_YEAR);
    }

    function _effectiveRewardRate(address token) internal view returns (uint256) {
        return rewardRateConfigured[token] ? rewardRateBps[token] : DEFAULT_RATE_BPS;
    }
}
