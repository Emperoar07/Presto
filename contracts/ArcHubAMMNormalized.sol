// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./libraries/Math.sol";

contract ArcHubAMMNormalized is Ownable, Pausable {
    using SafeERC20 for IERC20;

    uint8 private constant NORMALIZED_DECIMALS = 18;
    uint256 private constant MINIMUM_LIQUIDITY = 1000;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    address public immutable pathUSD;
    uint8 public immutable pathUSDDecimals;

    uint256 private _status;

    // Raw on-chain reserves for UI/script compatibility.
    mapping(address => uint256) public tokenReserves;
    mapping(address => uint256) public pathReserves;
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

        uint8 decimals_ = IERC20Metadata(_pathUSD).decimals();
        require(decimals_ <= NORMALIZED_DECIMALS, "Unsupported hub decimals");
        pathUSDDecimals = decimals_;
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

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

        uint8 userDecimals = _getTokenDecimals(userToken);
        uint256 userNormalized = _normalizeAmount(amount, userDecimals);
        uint256 pathAmount;

        uint256 userReserveNormalized = _normalizeAmount(tokenReserves[userToken], userDecimals);
        uint256 pathReserveNormalized = _normalizeAmount(pathReserves[userToken], pathUSDDecimals);

        if (userReserveNormalized == 0 || pathReserveNormalized == 0) {
            pathAmount = _denormalizeAmount(userNormalized, pathUSDDecimals);
        } else {
            uint256 pathNormalized = (userNormalized * pathReserveNormalized) / userReserveNormalized;
            pathAmount = _denormalizeAmount(pathNormalized, pathUSDDecimals);
        }

        uint256 userBefore = IERC20(userToken).balanceOf(address(this));
        IERC20(userToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 userReceived = IERC20(userToken).balanceOf(address(this)) - userBefore;
        require(userReceived == amount, "Fee-on-transfer not supported");

        uint256 pathBefore = IERC20(pathUSD).balanceOf(address(this));
        IERC20(pathUSD).safeTransferFrom(msg.sender, address(this), pathAmount);
        uint256 pathReceived = IERC20(pathUSD).balanceOf(address(this)) - pathBefore;
        require(pathReceived == pathAmount, "Fee-on-transfer not supported");

        uint256 userReceivedNormalized = _normalizeAmount(userReceived, userDecimals);
        uint256 pathReceivedNormalized = _normalizeAmount(pathReceived, pathUSDDecimals);

        uint256 minted;
        if (totalShares[userToken] == 0) {
            minted = Math.sqrt(userReceivedNormalized * pathReceivedNormalized);
            require(minted > MINIMUM_LIQUIDITY, "Insufficient initial liquidity");

            shares[userToken][address(0)] = MINIMUM_LIQUIDITY;
            totalShares[userToken] = minted;
            shares[userToken][msg.sender] = minted - MINIMUM_LIQUIDITY;

            emit MinimumLiquidityLocked(userToken, MINIMUM_LIQUIDITY);
        } else {
            uint256 shareByUser = (userReceivedNormalized * totalShares[userToken]) / userReserveNormalized;
            uint256 shareByPath = (pathReceivedNormalized * totalShares[userToken]) / pathReserveNormalized;
            minted = Math.min(shareByUser, shareByPath);
            require(minted > 0, "Zero shares");

            totalShares[userToken] += minted;
            shares[userToken][msg.sender] += minted;
        }

        tokenReserves[userToken] += userReceived;
        pathReserves[userToken] += pathReceived;

        emit LiquidityAdded(msg.sender, userToken, userReceived, pathReceived, minted);
        return minted;
    }

    function liquidityOf(address userToken, address provider) external view returns (uint256) {
        return shares[userToken][provider];
    }

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

        uint256 rawUserReserve = tokenReserves[userToken];
        uint256 rawPathReserve = pathReserves[userToken];
        uint256 total = totalShares[userToken];
        require(total > 0, "No shares");

        userOut = (shareAmount * rawUserReserve) / total;
        pathOut = (shareAmount * rawPathReserve) / total;
        require(userOut >= minUserOut && pathOut >= minPathOut, "Slippage tolerance exceeded");

        shares[userToken][msg.sender] = userShares - shareAmount;
        totalShares[userToken] = total - shareAmount;
        tokenReserves[userToken] = rawUserReserve - userOut;
        pathReserves[userToken] = rawPathReserve - pathOut;

        IERC20(userToken).safeTransfer(msg.sender, userOut);
        IERC20(pathUSD).safeTransfer(msg.sender, pathOut);

        emit LiquidityRemoved(msg.sender, userToken, userOut, pathOut, shareAmount);
        return (userOut, pathOut);
    }

    function getQuote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256 amountOut) {
        if (amountIn == 0) return 0;
        if (tokenIn == tokenOut) return amountIn;

        if (tokenIn == pathUSD) {
            uint8 tokenOutDecimals = _getTokenDecimals(tokenOut);
            uint256 amountInNormalized = _normalizeAmount(amountIn, pathUSDDecimals);
            uint256 reserveInNormalized = _normalizeAmount(pathReserves[tokenOut], pathUSDDecimals);
            uint256 reserveOutNormalized = _normalizeAmount(tokenReserves[tokenOut], tokenOutDecimals);
            uint256 amountOutNormalized = _getAmountOut(amountInNormalized, reserveInNormalized, reserveOutNormalized);
            return _denormalizeAmount(amountOutNormalized, tokenOutDecimals);
        }

        if (tokenOut == pathUSD) {
            uint8 tokenInDecimals = _getTokenDecimals(tokenIn);
            uint256 amountInNormalized = _normalizeAmount(amountIn, tokenInDecimals);
            uint256 reserveInNormalized = _normalizeAmount(tokenReserves[tokenIn], tokenInDecimals);
            uint256 reserveOutNormalized = _normalizeAmount(pathReserves[tokenIn], pathUSDDecimals);
            uint256 amountOutNormalized = _getAmountOut(amountInNormalized, reserveInNormalized, reserveOutNormalized);
            return _denormalizeAmount(amountOutNormalized, pathUSDDecimals);
        }

        uint8 tokenInDecimals = _getTokenDecimals(tokenIn);
        uint8 tokenOutDecimals = _getTokenDecimals(tokenOut);

        uint256 amountInNormalized = _normalizeAmount(amountIn, tokenInDecimals);
        uint256 reserveInNormalized = _normalizeAmount(tokenReserves[tokenIn], tokenInDecimals);
        uint256 pathReserveOutNormalized = _normalizeAmount(pathReserves[tokenIn], pathUSDDecimals);
        uint256 amountPathNormalized = _getAmountOut(amountInNormalized, reserveInNormalized, pathReserveOutNormalized);
        uint256 amountPathRaw = _denormalizeAmount(amountPathNormalized, pathUSDDecimals);
        uint256 amountPathRoundedNormalized = _normalizeAmount(amountPathRaw, pathUSDDecimals);

        uint256 reservePathInNormalized = _normalizeAmount(pathReserves[tokenOut], pathUSDDecimals);
        uint256 reserveOutNormalized = _normalizeAmount(tokenReserves[tokenOut], tokenOutDecimals);
        uint256 amountOutNormalized = _getAmountOut(amountPathRoundedNormalized, reservePathInNormalized, reserveOutNormalized);

        return _denormalizeAmount(amountOutNormalized, tokenOutDecimals);
    }

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

    function getOrderbook(address, uint8) external pure returns (Order[] memory bids, Order[] memory asks) {
        bids = new Order[](0);
        asks = new Order[](0);
    }

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

        uint256 inBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 amountInReceived = IERC20(tokenIn).balanceOf(address(this)) - inBefore;
        require(amountInReceived > 0, "Zero amount received");

        if (tokenIn == pathUSD) {
            uint8 tokenOutDecimals = _getTokenDecimals(tokenOut);
            uint256 amountInNormalized = _normalizeAmount(amountInReceived, pathUSDDecimals);
            uint256 reserveInNormalized = _normalizeAmount(pathReserves[tokenOut], pathUSDDecimals);
            uint256 reserveOutNormalized = _normalizeAmount(tokenReserves[tokenOut], tokenOutDecimals);
            uint256 amountOutNormalized = _getAmountOut(amountInNormalized, reserveInNormalized, reserveOutNormalized);
            amountOut = _denormalizeAmount(amountOutNormalized, tokenOutDecimals);

            require(amountOut > 0, "Insufficient output");
            require(amountOut >= minAmountOut, "Slippage tolerance exceeded");
            require(amountOut <= tokenReserves[tokenOut], "Insufficient liquidity");

            pathReserves[tokenOut] += amountInReceived;
            tokenReserves[tokenOut] -= amountOut;
        } else if (tokenOut == pathUSD) {
            uint8 tokenInDecimals = _getTokenDecimals(tokenIn);
            uint256 amountInNormalized = _normalizeAmount(amountInReceived, tokenInDecimals);
            uint256 reserveInNormalized = _normalizeAmount(tokenReserves[tokenIn], tokenInDecimals);
            uint256 reserveOutNormalized = _normalizeAmount(pathReserves[tokenIn], pathUSDDecimals);
            uint256 amountOutNormalized = _getAmountOut(amountInNormalized, reserveInNormalized, reserveOutNormalized);
            amountOut = _denormalizeAmount(amountOutNormalized, pathUSDDecimals);

            require(amountOut > 0, "Insufficient output");
            require(amountOut >= minAmountOut, "Slippage tolerance exceeded");
            require(amountOut <= pathReserves[tokenIn], "Insufficient liquidity");

            tokenReserves[tokenIn] += amountInReceived;
            pathReserves[tokenIn] -= amountOut;
        } else {
            uint8 tokenInDecimals = _getTokenDecimals(tokenIn);
            uint8 tokenOutDecimals = _getTokenDecimals(tokenOut);

            uint256 amountInNormalized = _normalizeAmount(amountInReceived, tokenInDecimals);
            uint256 reserveInANormalized = _normalizeAmount(tokenReserves[tokenIn], tokenInDecimals);
            uint256 reservePathANormalized = _normalizeAmount(pathReserves[tokenIn], pathUSDDecimals);
            uint256 amountPathNormalized = _getAmountOut(amountInNormalized, reserveInANormalized, reservePathANormalized);
            uint256 amountPathRaw = _denormalizeAmount(amountPathNormalized, pathUSDDecimals);
            uint256 amountPathRoundedNormalized = _normalizeAmount(amountPathRaw, pathUSDDecimals);

            uint256 reservePathBNormalized = _normalizeAmount(pathReserves[tokenOut], pathUSDDecimals);
            uint256 reserveOutBNormalized = _normalizeAmount(tokenReserves[tokenOut], tokenOutDecimals);
            uint256 amountOutNormalized = _getAmountOut(amountPathRoundedNormalized, reservePathBNormalized, reserveOutBNormalized);
            amountOut = _denormalizeAmount(amountOutNormalized, tokenOutDecimals);

            require(amountOut > 0, "Insufficient output in second hop");
            require(amountOut >= minAmountOut, "Slippage tolerance exceeded");
            require(amountOut <= tokenReserves[tokenOut], "Insufficient liquidity in second hop");

            require(amountPathRaw > 0, "Insufficient output in first hop");
            require(amountPathRaw <= pathReserves[tokenIn], "Insufficient liquidity in first hop");

            tokenReserves[tokenIn] += amountInReceived;
            pathReserves[tokenIn] -= amountPathRaw;
            pathReserves[tokenOut] += amountPathRaw;
            tokenReserves[tokenOut] -= amountOut;
        }

        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
        return amountOut;
    }

    function pause() external onlyOwner {
        _pause();
        emit EmergencyPause(msg.sender, block.timestamp);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpause(msg.sender, block.timestamp);
    }

    function _getTokenDecimals(address token) internal view returns (uint8) {
        uint8 decimals_ = IERC20Metadata(token).decimals();
        require(decimals_ <= NORMALIZED_DECIMALS, "Unsupported decimals");
        return decimals_;
    }

    function _normalizeAmount(uint256 rawAmount, uint8 decimals_) internal pure returns (uint256) {
        if (decimals_ == NORMALIZED_DECIMALS) return rawAmount;
        return rawAmount * (10 ** (NORMALIZED_DECIMALS - decimals_));
    }

    function _denormalizeAmount(uint256 normalizedAmount, uint8 decimals_) internal pure returns (uint256) {
        if (decimals_ == NORMALIZED_DECIMALS) return normalizedAmount;
        return normalizedAmount / (10 ** (NORMALIZED_DECIMALS - decimals_));
    }
}
