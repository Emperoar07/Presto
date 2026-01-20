// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../UniswapV2ERC20.sol";

contract MockERC20 is UniswapV2ERC20 {
    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        // In this simple mock, we just use the inherited name/symbol/decimals from UniswapV2ERC20 
        // OR we should override them. 
        // Since UniswapV2ERC20 has them as constant, we can't override easily without changing the parent.
        // For simplicity in this specific setup, we'll create a separate simple ERC20 or just use the parent 
        // but the parent is for LP tokens.
        // Let's make this a standalone simple ERC20 to avoid confusion.
    }
}

contract SimpleToken {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint public totalSupply;
    mapping(address => uint) public balanceOf;
    mapping(address => mapping(address => uint)) public allowance;

    event Transfer(address indexed from, address indexed to, uint value);
    event Approval(address indexed owner, address indexed spender, uint value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        _mint(msg.sender, 1000000 * 10**uint(_decimals));
    }

    function mint(address to, uint amount) external {
        _mint(to, amount);
    }

    function _mint(address to, uint value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function approve(address spender, uint value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint value) external returns (bool) {
        require(balanceOf[from] >= value, "Insufficient balance");
        if (allowance[from][msg.sender] != type(uint).max) {
            require(allowance[from][msg.sender] >= value, "Insufficient allowance");
            allowance[from][msg.sender] -= value;
        }
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }
}
