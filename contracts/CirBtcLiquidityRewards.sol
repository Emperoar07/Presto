// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICirBtcPair is IERC20 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

interface ICirBtcRouter {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);
}

contract CirBtcLiquidityRewards is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usyc;
    IERC20 public immutable cirBtc;
    IERC20 public immutable usdc;
    ICirBtcPair public immutable pair;
    ICirBtcRouter public immutable router;

    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant rewardRateBps = 100;
    uint256 public immutable principalPerLpX18;

    mapping(address => uint256) public stakedLp;
    mapping(address => uint256) public principalUsdc;
    mapping(address => uint256) public pendingRewards;
    mapping(address => uint256) public lastCheckpoint;

    event PositionActivated(address indexed provider, uint256 lpAmount, uint256 principalAdded);
    event LiquidityAdded(
        address indexed provider,
        uint256 cirBtcAmount,
        uint256 usdcAmount,
        uint256 lpAmount,
        uint256 principalAdded
    );
    event LiquidityRemoved(
        address indexed provider,
        uint256 lpAmount,
        uint256 cirBtcAmount,
        uint256 usdcAmount,
        uint256 principalRemoved
    );
    event RewardAccrued(address indexed provider, uint256 amount);
    event RewardClaimed(address indexed provider, uint256 amount);
    event RewardFundingWithdrawn(address indexed recipient, uint256 amount);

    constructor(
        address usycAddress,
        address cirBtcAddress,
        address usdcAddress,
        address pairAddress,
        address routerAddress
    ) Ownable(msg.sender) {
        require(usycAddress != address(0), "USYC required");
        require(cirBtcAddress != address(0), "cirBTC required");
        require(usdcAddress != address(0), "USDC required");
        require(pairAddress != address(0), "pair required");
        require(routerAddress != address(0), "router required");

        ICirBtcPair configuredPair = ICirBtcPair(pairAddress);
        address token0 = configuredPair.token0();
        address token1 = configuredPair.token1();
        require(
            (token0 == cirBtcAddress && token1 == usdcAddress) ||
                (token0 == usdcAddress && token1 == cirBtcAddress),
            "pair tokens mismatch"
        );
        (uint112 reserve0, uint112 reserve1,) = configuredPair.getReserves();
        uint256 supply = configuredPair.totalSupply();
        uint256 usdcReserve = token0 == usdcAddress ? uint256(reserve0) : uint256(reserve1);
        require(supply > 0 && usdcReserve > 0, "pair liquidity required");

        usyc = IERC20(usycAddress);
        cirBtc = IERC20(cirBtcAddress);
        usdc = IERC20(usdcAddress);
        pair = configuredPair;
        router = ICirBtcRouter(routerAddress);
        principalPerLpX18 = (usdcReserve * 2 * 1e18) / supply;
    }

    function activate(uint256 lpAmount) external nonReentrant {
        _checkpoint(msg.sender);
        _activate(msg.sender, lpAmount);
    }

    function activateWithPermit(
        uint256 lpAmount,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        _checkpoint(msg.sender);
        pair.permit(msg.sender, address(this), lpAmount, permitDeadline, v, r, s);
        _activate(msg.sender, lpAmount);
    }

    function addLiquidity(
        uint256 cirBtcDesired,
        uint256 usdcDesired,
        uint256 cirBtcMin,
        uint256 usdcMin,
        uint256 deadline
    ) external nonReentrant returns (uint256 cirBtcUsed, uint256 usdcUsed, uint256 lpMinted) {
        require(cirBtcDesired > 0 && usdcDesired > 0, "amount required");
        _checkpoint(msg.sender);

        cirBtc.safeTransferFrom(msg.sender, address(this), cirBtcDesired);
        usdc.safeTransferFrom(msg.sender, address(this), usdcDesired);
        cirBtc.forceApprove(address(router), cirBtcDesired);
        usdc.forceApprove(address(router), usdcDesired);

        (cirBtcUsed, usdcUsed, lpMinted) = router.addLiquidity(
            address(cirBtc),
            address(usdc),
            cirBtcDesired,
            usdcDesired,
            cirBtcMin,
            usdcMin,
            address(this),
            deadline
        );
        require(lpMinted > 0, "no LP minted");

        cirBtc.forceApprove(address(router), 0);
        usdc.forceApprove(address(router), 0);
        if (cirBtcDesired > cirBtcUsed) cirBtc.safeTransfer(msg.sender, cirBtcDesired - cirBtcUsed);
        if (usdcDesired > usdcUsed) usdc.safeTransfer(msg.sender, usdcDesired - usdcUsed);

        uint256 principalAdded = usdcUsed * 2;
        stakedLp[msg.sender] += lpMinted;
        principalUsdc[msg.sender] += principalAdded;
        emit LiquidityAdded(msg.sender, cirBtcUsed, usdcUsed, lpMinted, principalAdded);
    }

    function removeLiquidity(
        uint256 lpAmount,
        uint256 cirBtcMin,
        uint256 usdcMin,
        uint256 deadline
    ) external nonReentrant returns (uint256 cirBtcOut, uint256 usdcOut) {
        require(lpAmount > 0, "amount required");
        uint256 currentLp = stakedLp[msg.sender];
        require(lpAmount <= currentLp, "insufficient staked LP");
        _checkpoint(msg.sender);

        uint256 principalRemoved = (principalUsdc[msg.sender] * lpAmount) / currentLp;
        stakedLp[msg.sender] = currentLp - lpAmount;
        principalUsdc[msg.sender] -= principalRemoved;

        IERC20(address(pair)).forceApprove(address(router), lpAmount);
        (cirBtcOut, usdcOut) = router.removeLiquidity(
            address(cirBtc),
            address(usdc),
            lpAmount,
            cirBtcMin,
            usdcMin,
            msg.sender,
            deadline
        );
        IERC20(address(pair)).forceApprove(address(router), 0);

        emit LiquidityRemoved(msg.sender, lpAmount, cirBtcOut, usdcOut, principalRemoved);
    }

    function claim() external nonReentrant returns (uint256 amount) {
        _checkpoint(msg.sender);
        amount = pendingRewards[msg.sender];
        require(amount > 0, "nothing to claim");
        require(usyc.balanceOf(address(this)) >= amount, "insufficient reward balance");
        pendingRewards[msg.sender] = 0;
        usyc.safeTransfer(msg.sender, amount);
        emit RewardClaimed(msg.sender, amount);
    }

    function claimableOf(address provider) public view returns (uint256) {
        return pendingRewards[provider] + _accruedSinceCheckpoint(provider);
    }

    function contractBalance() external view returns (uint256) {
        return usyc.balanceOf(address(this));
    }

    function withdrawUsyc(uint256 amount) external onlyOwner {
        usyc.safeTransfer(msg.sender, amount);
        emit RewardFundingWithdrawn(msg.sender, amount);
    }

    function _activate(address provider, uint256 lpAmount) private {
        require(lpAmount > 0, "amount required");
        uint256 principalAdded = _principalForLp(lpAmount);
        IERC20(address(pair)).safeTransferFrom(provider, address(this), lpAmount);
        stakedLp[provider] += lpAmount;
        principalUsdc[provider] += principalAdded;
        emit PositionActivated(provider, lpAmount, principalAdded);
    }

    function _checkpoint(address provider) private {
        uint256 accrued = _accruedSinceCheckpoint(provider);
        if (accrued > 0) {
            pendingRewards[provider] += accrued;
            emit RewardAccrued(provider, accrued);
        }
        lastCheckpoint[provider] = block.timestamp;
    }

    function _accruedSinceCheckpoint(address provider) private view returns (uint256) {
        uint256 checkpoint = lastCheckpoint[provider];
        if (checkpoint == 0 || checkpoint == block.timestamp) return 0;
        uint256 principal = principalUsdc[provider];
        if (principal == 0) return 0;
        return (principal * rewardRateBps * (block.timestamp - checkpoint)) / (10000 * SECONDS_PER_YEAR);
    }

    /**
     * USDC-equivalent principal for `lpAmount` valued at the LIVE pair state,
     * matching how addLiquidity() values freshly minted LP (usdcUsed * 2).
     *
     * The immutable `principalPerLpX18` snapshot taken at construction is kept
     * only for reference/ABI compatibility: using it here would let activate()
     * value LP at a stale pre-move reserve ratio, so a cirBTC price move made
     * activated LPs accrue 1% APR on a principal that no longer matched TVL.
     */
    function _principalForLp(uint256 lpAmount) private view returns (uint256) {
        uint256 supply = pair.totalSupply();
        if (supply == 0) return 0;
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        uint256 usdcReserve = pair.token0() == address(usdc) ? uint256(reserve0) : uint256(reserve1);
        return (lpAmount * usdcReserve * 2) / supply;
    }
}
