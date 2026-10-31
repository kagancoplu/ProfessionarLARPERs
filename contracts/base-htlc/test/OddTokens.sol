// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only ERC-20 variants for the HTLC's token handling (F-1, F-2). Never deployed.
abstract contract BaseToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function _move(address from, address to, uint256 amount) internal virtual {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }

    function _spend(address from, uint256 amount) internal {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        allowance[from][msg.sender] = a - amount;
    }
}

/// @notice Takes 1 % of every transfer (F-1).
contract FeeToken is BaseToken {
    function transfer(address to, uint256 amount) external returns (bool) { _move(msg.sender, to, amount); return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) { _spend(from, amount); _move(from, to, amount); return true; }
    function _move(address from, address to, uint256 amount) internal override {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount - amount / 100;
    }
}

/// @notice Returns nothing from transfer and transferFrom, like USDT on Ethereum (F-2).
contract NoReturnToken is BaseToken {
    function transfer(address to, uint256 amount) external { _move(msg.sender, to, amount); }
    function transferFrom(address from, address to, uint256 amount) external { _spend(from, amount); _move(from, to, amount); }
}

/// @notice Returns false instead of reverting when a transfer cannot happen (F-2).
contract FalseToken is BaseToken {
    function transfer(address to, uint256 amount) external returns (bool) { if (balanceOf[msg.sender] < amount) return false; _move(msg.sender, to, amount); return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (balanceOf[from] < amount || allowance[from][msg.sender] < amount) return false;
        _spend(from, amount); _move(from, to, amount); return true;
    }
}
