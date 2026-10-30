// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface the HTLC needs.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title AgentCoop Coop Rail HTLC (Base side of the USDC -> BSV swap, FINAL-IDEA §4.10)
/// @notice The sender locks ERC-20 tokens for `receiver` under sha256(secret). The receiver
///         (or anyone) claims with the secret before `timeout`; after `timeout` the sender
///         gets them back. sha256, not keccak: the BSV side checks the same secret with OP_SHA256.
contract AgentCoopHTLC {
    enum State { None, Locked, Claimed, Refunded }

    struct Lock {
        address sender;
        address receiver;
        address token;
        uint256 amount;
        bytes32 hashlock;
        uint64 timeout;
        State state;
    }

    mapping(bytes32 => Lock) public locks;

    event Locked(bytes32 indexed id, address indexed sender, address indexed receiver, address token, uint256 amount, bytes32 hashlock, uint64 timeout);
    event Claimed(bytes32 indexed id, bytes32 secret);
    event Refunded(bytes32 indexed id);

    function lock(address receiver, address token, uint256 amount, bytes32 hashlock, uint64 timeout) external returns (bytes32 id) {
        require(receiver != address(0) && token != address(0), "zero address");
        require(amount > 0, "zero amount");
        require(timeout > block.timestamp, "timeout in the past");
        id = keccak256(abi.encode(msg.sender, receiver, token, amount, hashlock, timeout));
        require(locks[id].state == State.None, "lock exists");
        locks[id] = Lock(msg.sender, receiver, token, amount, hashlock, timeout, State.Locked);
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Locked(id, msg.sender, receiver, token, amount, hashlock, timeout);
    }

    function claim(bytes32 id, bytes32 secret) external {
        Lock storage l = locks[id];
        require(l.state == State.Locked, "not locked");
        require(block.timestamp < l.timeout, "expired");
        require(sha256(abi.encodePacked(secret)) == l.hashlock, "wrong secret");
        l.state = State.Claimed;
        require(IERC20(l.token).transfer(l.receiver, l.amount), "transfer failed");
        emit Claimed(id, secret);
    }

    function refund(bytes32 id) external {
        Lock storage l = locks[id];
        require(l.state == State.Locked, "not locked");
        require(block.timestamp >= l.timeout, "not expired");
        l.state = State.Refunded;
        require(IERC20(l.token).transfer(l.sender, l.amount), "transfer failed");
        emit Refunded(id);
    }
}
