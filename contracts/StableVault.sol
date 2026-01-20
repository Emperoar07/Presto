// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title StableVault
 * @notice A vault for swapping whitelisted stablecoins at 1:1 rate
 * @dev SECURITY: Only whitelisted tokens can be swapped to prevent drain attacks
 */
contract StableVault {
    using SafeERC20 for IERC20;

    address public owner;

    /// @notice Mapping of whitelisted tokens that can be swapped
    mapping(address => bool) public whitelistedTokens;

    /// @notice Array of all whitelisted token addresses for enumeration
    address[] public tokenList;

    event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amount);
    event Withdrawal(address indexed token, uint256 amount);
    event TokenWhitelisted(address indexed token);
    event TokenRemoved(address indexed token);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error SameToken();
    error ZeroAmount();
    error InsufficientLiquidity();
    error TokenNotWhitelisted(address token);
    error ZeroAddress();
    error AlreadyWhitelisted();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyWhitelisted(address _token) {
        if (!whitelistedTokens[_token]) revert TokenNotWhitelisted(_token);
        _;
    }

    constructor(address[] memory _initialTokens) {
        owner = msg.sender;

        // Whitelist initial tokens
        for (uint256 i = 0; i < _initialTokens.length; i++) {
            if (_initialTokens[i] != address(0)) {
                whitelistedTokens[_initialTokens[i]] = true;
                tokenList.push(_initialTokens[i]);
                emit TokenWhitelisted(_initialTokens[i]);
            }
        }
    }

    /**
     * @notice Add a token to the whitelist
     * @param _token Address of the token to whitelist
     */
    function addToken(address _token) external onlyOwner {
        if (_token == address(0)) revert ZeroAddress();
        if (whitelistedTokens[_token]) revert AlreadyWhitelisted();

        whitelistedTokens[_token] = true;
        tokenList.push(_token);
        emit TokenWhitelisted(_token);
    }

    /**
     * @notice Remove a token from the whitelist
     * @param _token Address of the token to remove
     */
    function removeToken(address _token) external onlyOwner {
        if (!whitelistedTokens[_token]) revert TokenNotWhitelisted(_token);

        whitelistedTokens[_token] = false;

        // Remove from tokenList array
        for (uint256 i = 0; i < tokenList.length; i++) {
            if (tokenList[i] == _token) {
                tokenList[i] = tokenList[tokenList.length - 1];
                tokenList.pop();
                break;
            }
        }
        emit TokenRemoved(_token);
    }

    /**
     * @notice Transfer ownership to a new address
     * @param _newOwner Address of the new owner
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        if (_newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }

    /**
     * @notice Get the number of whitelisted tokens
     */
    function getWhitelistedTokenCount() external view returns (uint256) {
        return tokenList.length;
    }

    /**
     * @dev Swaps a stablecoin for another at a 1:1 rate.
     * @param _tokenIn Address of the token to deposit (must be whitelisted).
     * @param _tokenOut Address of the token to receive (must be whitelisted).
     * @param _amount Amount of tokens to swap.
     */
    function swap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amount
    ) external onlyWhitelisted(_tokenIn) onlyWhitelisted(_tokenOut) {
        if (_tokenIn == _tokenOut) revert SameToken();
        if (_amount == 0) revert ZeroAmount();

        // Check if contract has enough liquidity for the output token
        uint256 contractBalance = IERC20(_tokenOut).balanceOf(address(this));
        if (contractBalance < _amount) revert InsufficientLiquidity();

        // Transfer tokenIn from user to contract
        // User must have approved this contract to spend _amount of _tokenIn
        IERC20(_tokenIn).safeTransferFrom(msg.sender, address(this), _amount);

        // Transfer tokenOut from contract to user
        IERC20(_tokenOut).safeTransfer(msg.sender, _amount);

        emit Swap(msg.sender, _tokenIn, _tokenOut, _amount);
    }

    /**
     * @dev Owner can withdraw liquidity.
     * @param _token Token to withdraw.
     * @param _amount Amount to withdraw.
     */
    function withdraw(address _token, uint256 _amount) external onlyOwner {
        if (_amount == 0) revert ZeroAmount();
        uint256 balance = IERC20(_token).balanceOf(address(this));
        if (balance < _amount) revert InsufficientLiquidity();

        IERC20(_token).safeTransfer(msg.sender, _amount);

        emit Withdrawal(_token, _amount);
    }

    /**
     * @dev Returns the contract's balance of a specific token.
     * @param _token Token address.
     */
    function getBalance(address _token) external view returns (uint256) {
        return IERC20(_token).balanceOf(address(this));
    }

    /**
     * @dev Check if a token is whitelisted.
     * @param _token Token address to check.
     */
    function isWhitelisted(address _token) external view returns (bool) {
        return whitelistedTokens[_token];
    }
}
