// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ArcStableSwapPool is Ownable, Pausable, ReentrancyGuard {
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
    mapping(address => uint256) private _tokenIndex;
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
            _tokenIndex[token] = i;
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

    function addLiquidity(uint256[] calldata amounts, uint256 minLpOut, uint256 deadline) external nonReentrant whenNotPaused returns (uint256 lpOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        uint256 n = _supportedTokens.length;
        if (amounts.length != n) revert InvalidAmountsLength();

        // LP is minted against the change in the StableSwap invariant D — the
        // same invariant swaps price against — not the raw sum of balances. An
        // imbalanced deposit therefore mints fewer shares, and the imbalance
        // fee below makes "imbalanced add + balanced remove" no cheaper than a
        // taxed swap (closes the fee-light rebalance path).
        uint256[] memory oldBalances = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            oldBalances[i] = _normalizeAmount(_supportedTokens[i], reserves[_supportedTokens[i]]);
        }
        uint256 d0 = totalLpSupply == 0 ? 0 : _getD(oldBalances);

        uint256 addedNormalized;
        uint256[] memory newBalances = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 amount = amounts[i];
            if (amount > 0) {
                address token = _supportedTokens[i];
                IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
                reserves[token] += amount;
                addedNormalized += _normalizeAmount(token, amount);
            }
            newBalances[i] = _normalizeAmount(_supportedTokens[i], reserves[_supportedTokens[i]]);
        }
        if (addedNormalized == 0) revert ZeroAmount();

        uint256 d1 = _getD(newBalances);

        if (totalLpSupply == 0) {
            // First provider seeds every coin; LP == D of the initial deposit.
            if (d1 <= MINIMUM_LIQUIDITY) revert InsufficientLpOut();
            totalLpSupply = d1;
            lpBalanceOf[address(0)] = MINIMUM_LIQUIDITY;
            lpOut = d1 - MINIMUM_LIQUIDITY;
            lpBalanceOf[msg.sender] += lpOut;
        } else {
            // Charge the Curve imbalance fee on each coin's deviation from the
            // ideal balanced deposit. The fee stays in the pool (reserves keep
            // the full amounts) and only reduces the D used to size the mint.
            uint256 fee = (feeBps * n) / (4 * (n - 1));
            for (uint256 i = 0; i < n; i++) {
                uint256 ideal = (d1 * oldBalances[i]) / d0;
                uint256 diff = newBalances[i] > ideal ? newBalances[i] - ideal : ideal - newBalances[i];
                newBalances[i] -= (fee * diff) / MAX_FEE_BPS;
            }
            uint256 d2 = _getD(newBalances);
            if (d2 <= d0) revert InsufficientLpOut();
            lpOut = (totalLpSupply * (d2 - d0)) / d0;
            if (lpOut == 0) revert InsufficientLpOut();
            totalLpSupply += lpOut;
            lpBalanceOf[msg.sender] += lpOut;
        }

        if (lpOut < minLpOut) revert InsufficientLpOut();

        emit LiquidityAdded(msg.sender, lpOut);
    }

    function removeLiquidity(uint256 lpAmount, uint256[] calldata minAmountsOut, uint256 deadline) external nonReentrant whenNotPaused returns (uint256[] memory amountsOut) {
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

    function removeLiquidityOneToken(uint256 lpAmount, address tokenOut, uint256 minAmountOut, uint256 deadline) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (!isSupportedToken[tokenOut]) revert InvalidToken();
        if (lpAmount == 0) revert ZeroAmount();

        uint256 providerBalance = lpBalanceOf[msg.sender];
        if (providerBalance < lpAmount) revert InsufficientLpBalance();

        // Single-coin withdrawals are priced off the D invariant (with the
        // imbalance fee) rather than a raw proportional slice of one reserve —
        // so exiting entirely into one coin costs the same slippage a swap
        // would, and cannot be used as a fee-light rebalance.
        uint256 outNormalized = _calcWithdrawOneToken(lpAmount, tokenOut);
        amountOut = _denormalizeAmount(tokenOut, outNormalized);
        if (amountOut == 0 || amountOut < minAmountOut) revert InsufficientOutput();
        if (amountOut > reserves[tokenOut]) revert InsufficientLiquidity();

        lpBalanceOf[msg.sender] = providerBalance - lpAmount;
        totalLpSupply -= lpAmount;
        reserves[tokenOut] -= amountOut;

        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit LiquidityRemoved(msg.sender, lpAmount);
    }

    /// @dev Curve calc_withdraw_one_coin: normalized amount of `tokenOut` for
    ///      burning `lpAmount`, net of the imbalance fee.
    function _calcWithdrawOneToken(uint256 lpAmount, address tokenOut) internal view returns (uint256) {
        uint256 n = _supportedTokens.length;
        uint256 j = _tokenIndex[tokenOut];

        uint256[] memory xp = new uint256[](n);
        for (uint256 k = 0; k < n; k++) {
            xp[k] = _normalizeAmount(_supportedTokens[k], reserves[_supportedTokens[k]]);
        }

        uint256 d0 = _getD(xp);
        uint256 d1 = d0 - (lpAmount * d0) / totalLpSupply;
        uint256 newY = _getYD(j, xp, d1);

        uint256 fee = (feeBps * n) / (4 * (n - 1));
        uint256[] memory xpReduced = new uint256[](n);
        for (uint256 k = 0; k < n; k++) {
            uint256 dxExpected;
            if (k == j) {
                dxExpected = (xp[k] * d1) / d0 - newY;
            } else {
                dxExpected = xp[k] - (xp[k] * d1) / d0;
            }
            xpReduced[k] = xp[k] - (fee * dxExpected) / MAX_FEE_BPS;
        }

        uint256 dy = xpReduced[j] - _getYD(j, xpReduced, d1);
        // -1 rounds the output down in the pool's favour.
        return dy > 0 ? dy - 1 : 0;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (!isSupportedToken[tokenIn] || !isSupportedToken[tokenOut] || tokenIn == tokenOut) revert InvalidToken();
        if (amountIn == 0) revert ZeroAmount();

        uint256 reserveInBefore = reserves[tokenIn];
        uint256 reserveOutBefore = reserves[tokenOut];
        if (reserveInBefore == 0 || reserveOutBefore == 0) revert InsufficientLiquidity();

        // Pull input first; reserves[] is a separate accounting mapping (not the raw
        // balance), so the output is computed from the pre-swap reserves below.
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 outNormalized = _computeSwapOutput(tokenIn, tokenOut, amountIn);
        amountOut = _denormalizeAmount(tokenOut, outNormalized);
        if (amountOut == 0 || amountOut < minAmountOut) revert InsufficientOutput();
        if (amountOut > reserveOutBefore) revert InsufficientLiquidity();

        reserves[tokenIn] = reserveInBefore + amountIn;
        reserves[tokenOut] = reserveOutBefore - amountOut;

        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit TokenSwapped(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    function getQuote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        if (!isSupportedToken[tokenIn] || !isSupportedToken[tokenOut] || tokenIn == tokenOut) revert InvalidToken();
        if (amountIn == 0) return 0;
        if (reserves[tokenIn] == 0 || reserves[tokenOut] == 0) return 0;

        uint256 out = _denormalizeAmount(tokenOut, _computeSwapOutput(tokenIn, tokenOut, amountIn));
        uint256 reserveOut = reserves[tokenOut];
        return out > reserveOut ? reserveOut : out;
    }

    /**
     * @dev Curve StableSwap output for `amountIn` of `tokenIn` -> `tokenOut`, in normalized
     *      (18-dec) units and net of fee. Uses the constant-`D` invariant so price impact
     *      rises as the output reserve is drawn down (fixing the prior no-slippage formula).
     */
    function _computeSwapOutput(address tokenIn, address tokenOut, uint256 amountIn) internal view returns (uint256 outNormalized) {
        uint256 n = _supportedTokens.length;
        uint256[] memory xp = new uint256[](n);
        for (uint256 k = 0; k < n; k++) {
            xp[k] = _normalizeAmount(_supportedTokens[k], reserves[_supportedTokens[k]]);
        }

        uint256 i = _tokenIndex[tokenIn];
        uint256 j = _tokenIndex[tokenOut];

        uint256 x = xp[i] + _normalizeAmount(tokenIn, amountIn);
        uint256 y = _getY(i, j, x, xp);
        // -1 rounds the output down in the pool's favour.
        uint256 dy = xp[j] > y + 1 ? xp[j] - y - 1 : 0;
        uint256 fee = (dy * feeBps) / MAX_FEE_BPS;
        outNormalized = dy - fee;
    }

    /// @dev StableSwap invariant D via Newton's method (all balances must be > 0).
    function _getD(uint256[] memory xp) internal view returns (uint256) {
        uint256 n = xp.length;
        uint256 s;
        for (uint256 i = 0; i < n; i++) s += xp[i];
        if (s == 0) return 0;

        uint256 d = s;
        uint256 ann = ampFactor * n;
        for (uint256 iter = 0; iter < 255; iter++) {
            uint256 dP = d;
            for (uint256 i = 0; i < n; i++) {
                dP = (dP * d) / (xp[i] * n);
            }
            uint256 dPrev = d;
            d = ((ann * s + dP * n) * d) / ((ann - 1) * d + (n + 1) * dP);
            if (d > dPrev ? d - dPrev <= 1 : dPrev - d <= 1) break;
        }
        return d;
    }

    /// @dev Given new balance `x` of coin `i`, solve for balance `y` of coin `j` that holds D.
    function _getY(uint256 i, uint256 j, uint256 x, uint256[] memory xp) internal view returns (uint256) {
        uint256 n = xp.length;
        uint256 d = _getD(xp);
        uint256 ann = ampFactor * n;

        uint256 c = d;
        uint256 sum;
        for (uint256 k = 0; k < n; k++) {
            uint256 xk;
            if (k == i) xk = x;
            else if (k != j) xk = xp[k];
            else continue;
            sum += xk;
            c = (c * d) / (xk * n);
        }
        c = (c * d) / (ann * n);
        uint256 b = sum + d / ann;

        uint256 y = d;
        for (uint256 iter = 0; iter < 255; iter++) {
            uint256 yPrev = y;
            y = (y * y + c) / (2 * y + b - d);
            if (y > yPrev ? y - yPrev <= 1 : yPrev - y <= 1) break;
        }
        return y;
    }

    /// @dev Given a target invariant `d`, solve for balance `y` of coin `j`
    ///      holding the other balances in `xp` fixed. Used by single-coin
    ///      withdrawal (D is supplied rather than derived from `xp`).
    function _getYD(uint256 j, uint256[] memory xp, uint256 d) internal view returns (uint256) {
        uint256 n = xp.length;
        uint256 ann = ampFactor * n;

        uint256 c = d;
        uint256 sum;
        for (uint256 k = 0; k < n; k++) {
            if (k == j) continue;
            uint256 xk = xp[k];
            sum += xk;
            c = (c * d) / (xk * n);
        }
        c = (c * d) / (ann * n);
        uint256 b = sum + d / ann;

        uint256 y = d;
        for (uint256 iter = 0; iter < 255; iter++) {
            uint256 yPrev = y;
            y = (y * y + c) / (2 * y + b - d);
            if (y > yPrev ? y - yPrev <= 1 : yPrev - y <= 1) break;
        }
        return y;
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
