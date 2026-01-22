// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./libraries/Math.sol";

/**
 * @title TempoHubAMM
 * @notice Hub-and-spoke automated market maker using pathUSD as the central hub token.
 * @dev All token swaps route through pathUSD. For Token A -> Token B swaps,
 *      the AMM executes two hops: Token A -> pathUSD -> Token B.
 *      Uses Uniswap V2 constant product formula (x * y = k) with 0.3% fees.
 */
contract TempoHubAMM is Ownable, Pausable {
    using SafeERC20 for IERC20;

    address public immutable pathUSD;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    /// @notice Minimum liquidity locked forever to prevent inflation attacks
    uint256 private constant MINIMUM_LIQUIDITY = 1000;

    // Reserves for each token (Token <-> pathUSD)
    // tokenReserves[token] = amount of 'token' in the pool
    mapping(address => uint256) public tokenReserves;
    // pathReserves[token] = amount of 'pathUSD' paired with 'token'
    mapping(address => uint256) public pathReserves;
    // LP shares per token pool
    mapping(address => uint256) public totalShares;
    mapping(address => mapping(address => uint256)) public shares;

    event LiquidityAdded(address indexed provider, address indexed token, uint256 tokenAmount, uint256 pathAmount, uint256 shares);
    event LiquidityRemoved(address indexed provider, address indexed token, uint256 tokenAmount, uint256 pathAmount, uint256 shares);
    event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event EmergencyPause(address indexed by, uint256 timestamp);
    event EmergencyUnpause(address indexed by, uint256 timestamp);
    event MinimumLiquidityLocked(address indexed token, uint256 amount);

    constructor(address _pathUSD) Ownable(msg.sender) {
        require(_pathUSD != address(0), "Invalid pathUSD address");
        pathUSD = _pathUSD;
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    /**
     * @notice Add liquidity to a token-pathUSD pool
     * @param userToken The token to provide liquidity for
     * @param validatorToken Must be pathUSD
     * @param amount Amount of userToken to add
     * @param deadline Transaction must be executed before this timestamp
     * @return mintedShares The amount of LP shares minted to the provider
     */
    function addLiquidity(
        address userToken,
        address validatorToken,
        uint256 amount,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 mintedShares) {
        require(block.timestamp <= deadline, "Transaction expired");
        require(validatorToken == pathUSD, "Validator token must be pathUSD");
        require(userToken != pathUSD, "User token cannot be pathUSD");
        require(amount > 0, "Zero amount");

        uint256 userAmount = amount;
        uint256 pathAmount;

        uint256 rUser = tokenReserves[userToken];
        uint256 rPath = pathReserves[userToken];

        if (rUser == 0 || rPath == 0) {
            // Initial liquidity: 1:1 ratio
            pathAmount = userAmount;
        } else {
            // Maintain ratio
            pathAmount = (userAmount * rPath) / rUser;
        }

        // Transfer tokens in and enforce exact amounts (no fee-on-transfer).
        uint256 userBefore = IERC20(userToken).balanceOf(address(this));
        IERC20(userToken).safeTransferFrom(msg.sender, address(this), userAmount);
        uint256 userReceived = IERC20(userToken).balanceOf(address(this)) - userBefore;
        require(userReceived == userAmount, "Fee-on-transfer not supported");

        uint256 pathBefore = IERC20(pathUSD).balanceOf(address(this));
        IERC20(pathUSD).safeTransferFrom(msg.sender, address(this), pathAmount);
        uint256 pathReceived = IERC20(pathUSD).balanceOf(address(this)) - pathBefore;
        require(pathReceived == pathAmount, "Fee-on-transfer not supported");

        // Mint LP shares
        uint256 minted;
        if (totalShares[userToken] == 0) {
            // First liquidity provider - use geometric mean
            minted = Math.sqrt(userAmount * pathAmount);
            require(minted > MINIMUM_LIQUIDITY, "Insufficient initial liquidity");

            // Lock minimum liquidity forever to prevent inflation attacks
            shares[userToken][address(0)] = MINIMUM_LIQUIDITY;
            totalShares[userToken] = minted;
            shares[userToken][msg.sender] = minted - MINIMUM_LIQUIDITY;

            emit MinimumLiquidityLocked(userToken, MINIMUM_LIQUIDITY);
        } else {
            // Subsequent liquidity - maintain pool ratio
            uint256 shareByUser = (userAmount * totalShares[userToken]) / rUser;
            uint256 shareByPath = (pathAmount * totalShares[userToken]) / rPath;
            minted = Math.min(shareByUser, shareByPath);
            require(minted > 0, "Zero shares");

            totalShares[userToken] += minted;
            shares[userToken][msg.sender] += minted;
        }

        // Update reserves
        tokenReserves[userToken] += userAmount;
        pathReserves[userToken] += pathAmount;

        emit LiquidityAdded(msg.sender, userToken, userAmount, pathAmount, minted);
        return minted;
    }

    function liquidityOf(address userToken, address provider) external view returns (uint256) {
        return shares[userToken][provider];
    }

    /**
     * @notice Remove liquidity from a token-pathUSD pool
     * @dev This function works even when paused to allow emergency withdrawals
     * @param userToken The token to remove liquidity for
     * @param validatorToken Must be pathUSD
     * @param shareAmount Amount of LP shares to burn
     * @param minUserOut Minimum userToken amount to receive (slippage protection)
     * @param minPathOut Minimum pathUSD amount to receive (slippage protection)
     * @param deadline Transaction must be executed before this timestamp
     * @return userOut Amount of userToken returned
     * @return pathOut Amount of pathUSD returned
     */
    function removeLiquidity(
        address userToken,
        address validatorToken,
        uint256 shareAmount,
        uint256 minUserOut,
        uint256 minPathOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 userOut, uint256 pathOut) {
        require(block.timestamp <= deadline, "Transaction expired");
        require(validatorToken == pathUSD, "Validator token must be pathUSD");
        require(shareAmount > 0, "Zero share");
        uint256 userShares = shares[userToken][msg.sender];
        require(userShares >= shareAmount, "Insufficient shares");

        uint256 rUser = tokenReserves[userToken];
        uint256 rPath = pathReserves[userToken];
        uint256 total = totalShares[userToken];
        require(total > 0, "No shares");

        userOut = (shareAmount * rUser) / total;
        pathOut = (shareAmount * rPath) / total;
        require(userOut >= minUserOut && pathOut >= minPathOut, "Slippage tolerance exceeded");

        shares[userToken][msg.sender] = userShares - shareAmount;
        totalShares[userToken] = total - shareAmount;
        tokenReserves[userToken] = rUser - userOut;
        pathReserves[userToken] = rPath - pathOut;

        IERC20(userToken).safeTransfer(msg.sender, userOut);
        IERC20(pathUSD).safeTransfer(msg.sender, pathOut);

        emit LiquidityRemoved(msg.sender, userToken, userOut, pathOut, shareAmount);
        return (userOut, pathOut);
    }

    /**
     * @notice Calculate output amount for a given input (view function)
     * @dev Automatically routes through pathUSD for token-to-token swaps
     * @param tokenIn The token being sold
     * @param tokenOut The token being bought
     * @param amountIn Amount of tokenIn
     * @return amountOut Expected amount of tokenOut (after 0.3% fees)
     */
    function getQuote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256 amountOut) {
        if (amountIn == 0) return 0;
        if (tokenIn == tokenOut) return amountIn;

        // Case 1: pathUSD -> Token (Buy Token)
        if (tokenIn == pathUSD) {
            return _getAmountOut(amountIn, pathReserves[tokenOut], tokenReserves[tokenOut]);
        }

        // Case 2: Token -> pathUSD (Sell Token)
        if (tokenOut == pathUSD) {
            return _getAmountOut(amountIn, tokenReserves[tokenIn], pathReserves[tokenIn]);
        }

        // Case 3: Token A -> Token B (Multi-hop)
        // Step 1: Token A -> pathUSD
        uint256 pathAmount = _getAmountOut(amountIn, tokenReserves[tokenIn], pathReserves[tokenIn]);
        // Step 2: pathUSD -> Token B
        return _getAmountOut(pathAmount, pathReserves[tokenOut], tokenReserves[tokenOut]);
    }

    /**
     * @notice Internal helper using Uniswap V2 constant product formula with 0.3% fee
     * @dev Formula: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
     * @param amountIn Input amount
     * @param reserveIn Reserve of input token
     * @param reserveOut Reserve of output token
     * @return Output amount after fees
     */
    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        if (reserveIn == 0 || reserveOut == 0) return 0;
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        return numerator / denominator;
    }

    struct Order {
        int24 tick;
        uint256 amount;
    }

    function getOrderbook(address token, uint8 depth) external view returns (Order[] memory bids, Order[] memory asks) {
         // Return empty
         bids = new Order[](0);
         asks = new Order[](0);
    }

    /**
     * @notice Execute a token swap
     * @dev Automatically routes through pathUSD for token-to-token swaps
     * @param tokenIn The token being sold
     * @param tokenOut The token being bought
     * @param amountIn Amount of tokenIn to sell
     * @param minAmountOut Minimum acceptable amount of tokenOut (slippage protection)
     * @param deadline Transaction must be executed before this timestamp
     * @return amountOut Actual amount of tokenOut received
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        require(block.timestamp <= deadline, "Transaction expired");
        require(tokenIn != tokenOut, "Same token");
        require(amountIn > 0, "Zero amount");

        // Transfer Input Token and use actual received amount.
        uint256 inBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 amountInReceived = IERC20(tokenIn).balanceOf(address(this)) - inBefore;
        require(amountInReceived > 0, "Zero amount received");

        // Execute Swap logic
        if (tokenIn == pathUSD) {
            // Case 1: pathUSD -> Token (Buy Token)
            uint256 rIn = pathReserves[tokenOut];
            uint256 rOut = tokenReserves[tokenOut];
            require(rIn > 0 && rOut > 0, "Insufficient liquidity");
            amountOut = _getAmountOut(amountInReceived, rIn, rOut);
            require(amountOut > 0, "Insufficient output");

            require(amountOut >= minAmountOut, "Slippage tolerance exceeded");
            require(amountOut <= rOut, "Insufficient liquidity");

            pathReserves[tokenOut] = rIn + amountInReceived;
            tokenReserves[tokenOut] = rOut - amountOut;

        } else if (tokenOut == pathUSD) {
            // Case 2: Token -> pathUSD (Sell Token)
            uint256 rIn = tokenReserves[tokenIn];
            uint256 rOut = pathReserves[tokenIn];
            require(rIn > 0 && rOut > 0, "Insufficient liquidity");
            amountOut = _getAmountOut(amountInReceived, rIn, rOut);
            require(amountOut > 0, "Insufficient output");

            require(amountOut >= minAmountOut, "Slippage tolerance exceeded");
            require(amountOut <= rOut, "Insufficient liquidity");

            tokenReserves[tokenIn] = rIn + amountInReceived;
            pathReserves[tokenIn] = rOut - amountOut;

        } else {
            // Case 3: Token A -> Token B (Multi-hop via pathUSD)
            // Gas optimization: Calculate both swaps first, then batch reserve updates

            // Step 1: Calculate Token A -> pathUSD
            uint256 rInA = tokenReserves[tokenIn];
            uint256 rOutA = pathReserves[tokenIn];
            require(rInA > 0 && rOutA > 0, "Insufficient liquidity in first hop");
            uint256 amountPath = _getAmountOut(amountInReceived, rInA, rOutA);
            require(amountPath > 0, "Insufficient output in first hop");
            require(amountPath <= rOutA, "Insufficient liquidity in first hop");

            // Step 2: Calculate pathUSD -> Token B
            uint256 rInB = pathReserves[tokenOut];
            uint256 rOutB = tokenReserves[tokenOut];
            require(rInB > 0 && rOutB > 0, "Insufficient liquidity in second hop");
            amountOut = _getAmountOut(amountPath, rInB, rOutB);
            require(amountOut > 0, "Insufficient output in second hop");

            require(amountOut >= minAmountOut, "Slippage tolerance exceeded");
            require(amountOut <= rOutB, "Insufficient liquidity in second hop");

            // Batch reserve updates (saves 1 SSTORE = ~2900 gas)
            tokenReserves[tokenIn] = rInA + amountInReceived;
            pathReserves[tokenIn] = rOutA - amountPath;
            pathReserves[tokenOut] = rInB + amountPath;
            tokenReserves[tokenOut] = rOutB - amountOut;
        }

        // Transfer Output Token
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
        return amountOut;
    }

    /**
     * @notice Emergency pause - stops all swaps and liquidity additions
     * @dev Only owner can pause. Liquidity removal still works when paused for emergency withdrawals.
     */
    function pause() external onlyOwner {
        _pause();
        emit EmergencyPause(msg.sender, block.timestamp);
    }

    /**
     * @notice Unpause the contract to resume normal operations
     * @dev Only owner can unpause
     */
    function unpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpause(msg.sender, block.timestamp);
    }
}
