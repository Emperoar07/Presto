// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract ArcStableSwapPool is Ownable, Pausable {
    using SafeERC20 for IERC20;

    uint8 public constant NORMALIZED_DECIMALS = 18;
    uint256 public constant MAX_FEE_BPS = 10_000;
    uint256 public constant MINIMUM_LIQUIDITY = 1_000;

    error InvalidToken();
    error DuplicateToken(address token);
    error UnsupportedDecimals(address token, uint8 decimals);
    error InvalidAmplification();
    error InvalidFeeBps();
    error InvalidAmountsLength();
    error InsufficientLpOut();
    error InsufficientOutput();
    error DeadlineExpired();
    error ZeroAmount();
    error InsufficientLiquidity();
    error InsufficientLpBalance();

    address[] private _supportedTokens;
    mapping(address => bool) public isSupportedToken;
    mapping(address => uint8) public tokenDecimals;
    mapping(address => uint256) public reserves;
    mapping(address => uint256) public lpBalanceOf;

    uint256 public totalLpSupply;

    uint256 public immutable ampFactor;
    uint256 public immutable feeBps;

    event StableTokenRegistered(address indexed token, uint8 decimals);
    event LiquidityAdded(address indexed provider, uint256 lpOut);
    event LiquidityRemoved(address indexed provider, uint256 lpBurned);
    event TokenSwapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    constructor(address[] memory stableTokens_, uint256 ampFactor_, uint256 feeBps_) Ownable(msg.sender) {
        if (stableTokens_.length < 2) revert InvalidToken();
        if (ampFactor_ == 0) revert InvalidAmplification();
        if (feeBps_ >= MAX_FEE_BPS) revert InvalidFeeBps();

        ampFactor = ampFactor_;
        feeBps = feeBps_;

        for (uint256 i = 0; i < stableTokens_.length; i++) {
            address token = stableTokens_[i];
            if (token == address(0)) revert InvalidToken();
            if (isSupportedToken[token]) revert DuplicateToken(token);

            uint8 decimals_ = IERC20Metadata(token).decimals();
            if (decimals_ > NORMALIZED_DECIMALS) revert UnsupportedDecimals(token, decimals_);

            isSupportedToken[token] = true;
            tokenDecimals[token] = decimals_;
            _supportedTokens.push(token);

            emit StableTokenRegistered(token, decimals_);
        }
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return _supportedTokens;
    }

    function getTokenCount() external view returns (uint256) {
        return _supportedTokens.length;
    }

    function addLiquidity(uint256[] calldata amounts, uint256 minLpOut, uint256 deadline) external whenNotPaused returns (uint256 lpOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (amounts.length != _supportedTokens.length) revert InvalidAmountsLength();

        uint256 addedNormalized;
        uint256 currentInvariant = _getTotalNormalizedLiquidity();

        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 amount = amounts[i];
            if (amount == 0) continue;

            address token = _supportedTokens[i];
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            reserves[token] += amount;
            addedNormalized += _normalizeAmount(token, amount);
        }

        if (addedNormalized == 0) revert ZeroAmount();

        if (totalLpSupply == 0) {
            if (addedNormalized <= MINIMUM_LIQUIDITY) revert InsufficientLpOut();
            totalLpSupply = addedNormalized;
            lpBalanceOf[address(0)] = MINIMUM_LIQUIDITY;
            lpOut = addedNormalized - MINIMUM_LIQUIDITY;
            lpBalanceOf[msg.sender] += lpOut;
        } else {
            lpOut = (addedNormalized * totalLpSupply) / currentInvariant;
            if (lpOut == 0) revert InsufficientLpOut();
            totalLpSupply += lpOut;
            lpBalanceOf[msg.sender] += lpOut;
        }

        if (lpOut < minLpOut) revert InsufficientLpOut();

        emit LiquidityAdded(msg.sender, lpOut);
    }

    function removeLiquidity(uint256 lpAmount, uint256[] calldata minAmountsOut, uint256 deadline) external whenNotPaused returns (uint256[] memory amountsOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (lpAmount == 0) revert ZeroAmount();
        if (minAmountsOut.length != _supportedTokens.length) revert InvalidAmountsLength();

        uint256 providerBalance = lpBalanceOf[msg.sender];
        if (providerBalance < lpAmount) revert InsufficientLpBalance();

        amountsOut = new uint256[](_supportedTokens.length);
        uint256 supplyBefore = totalLpSupply;

        lpBalanceOf[msg.sender] = providerBalance - lpAmount;
        totalLpSupply = supplyBefore - lpAmount;

        for (uint256 i = 0; i < _supportedTokens.length; i++) {
            address token = _supportedTokens[i];
            uint256 amountOut = (reserves[token] * lpAmount) / supplyBefore;
            if (amountOut < minAmountsOut[i]) revert InsufficientOutput();

            reserves[token] -= amountOut;
            amountsOut[i] = amountOut;
            IERC20(token).safeTransfer(msg.sender, amountOut);
        }

        emit LiquidityRemoved(msg.sender, lpAmount);
    }

    function removeLiquidityOneToken(uint256 lpAmount, address tokenOut, uint256 minAmountOut, uint256 deadline) external whenNotPaused returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (!isSupportedToken[tokenOut]) revert InvalidToken();
        if (lpAmount == 0) revert ZeroAmount();

        uint256 providerBalance = lpBalanceOf[msg.sender];
        if (providerBalance < lpAmount) revert InsufficientLpBalance();

        amountOut = (reserves[tokenOut] * lpAmount) / totalLpSupply;
        if (amountOut < minAmountOut) revert InsufficientOutput();

        lpBalanceOf[msg.sender] = providerBalance - lpAmount;
        totalLpSupply -= lpAmount;
        reserves[tokenOut] -= amountOut;

        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit LiquidityRemoved(msg.sender, lpAmount);
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline) external whenNotPaused returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (!isSupportedToken[tokenIn] || !isSupportedToken[tokenOut] || tokenIn == tokenOut) revert InvalidToken();
        if (amountIn == 0) revert ZeroAmount();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 reserveInBefore = reserves[tokenIn];
        uint256 reserveOutBefore = reserves[tokenOut];
        if (reserveOutBefore == 0) revert InsufficientLiquidity();

        uint256 amountInNormalized = _normalizeAmount(tokenIn, amountIn);
        uint256 reserveInNormalized = _normalizeAmount(tokenIn, reserveInBefore);
        uint256 reserveOutNormalized = _normalizeAmount(tokenOut, reserveOutBefore);

        uint256 feeAdjusted = (amountInNormalized * (MAX_FEE_BPS - feeBps)) / MAX_FEE_BPS;
        uint256 imbalancePenalty = (feeAdjusted * ampFactor) / (ampFactor + reserveInNormalized + reserveOutNormalized);
        uint256 rawOutNormalized = feeAdjusted > imbalancePenalty ? feeAdjusted - imbalancePenalty : 0;
        uint256 cappedOutNormalized = rawOutNormalized > reserveOutNormalized ? reserveOutNormalized : rawOutNormalized;
        amountOut = _denormalizeAmount(tokenOut, cappedOutNormalized);

        if (amountOut == 0 || amountOut < minAmountOut) revert InsufficientOutput();

        reserves[tokenIn] = reserveInBefore + amountIn;
        reserves[tokenOut] = reserveOutBefore - amountOut;

        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit TokenSwapped(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    function getQuote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        if (!isSupportedToken[tokenIn] || !isSupportedToken[tokenOut] || tokenIn == tokenOut) revert InvalidToken();
        if (amountIn == 0) return 0;

        uint256 reserveIn = reserves[tokenIn];
        uint256 reserveOut = reserves[tokenOut];
        if (reserveOut == 0) return 0;

        uint256 amountInNormalized = _normalizeAmount(tokenIn, amountIn);
        uint256 reserveInNormalized = _normalizeAmount(tokenIn, reserveIn);
        uint256 reserveOutNormalized = _normalizeAmount(tokenOut, reserveOut);
        uint256 feeAdjusted = (amountInNormalized * (MAX_FEE_BPS - feeBps)) / MAX_FEE_BPS;
        uint256 imbalancePenalty = (feeAdjusted * ampFactor) / (ampFactor + reserveInNormalized + reserveOutNormalized);
        uint256 rawOutNormalized = feeAdjusted > imbalancePenalty ? feeAdjusted - imbalancePenalty : 0;
        uint256 cappedOutNormalized = rawOutNormalized > reserveOutNormalized ? reserveOutNormalized : rawOutNormalized;
        return _denormalizeAmount(tokenOut, cappedOutNormalized);
    }

    function getVirtualPrice() external view returns (uint256) {
        if (totalLpSupply == 0) return 10 ** NORMALIZED_DECIMALS;
        return (_getTotalNormalizedLiquidity() * (10 ** NORMALIZED_DECIMALS)) / totalLpSupply;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _getTotalNormalizedLiquidity() internal view returns (uint256 totalNormalized) {
        for (uint256 i = 0; i < _supportedTokens.length; i++) {
            totalNormalized += _normalizeAmount(_supportedTokens[i], reserves[_supportedTokens[i]]);
        }
    }

    function _normalizeAmount(address token, uint256 amount) internal view returns (uint256) {
        uint8 decimals_ = tokenDecimals[token];
        if (decimals_ == NORMALIZED_DECIMALS) return amount;
        return amount * (10 ** (NORMALIZED_DECIMALS - decimals_));
    }

    function _denormalizeAmount(address token, uint256 amount) internal view returns (uint256) {
        uint8 decimals_ = tokenDecimals[token];
        if (decimals_ == NORMALIZED_DECIMALS) return amount;
        return amount / (10 ** (NORMALIZED_DECIMALS - decimals_));
    }
}
