// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface the HTLC needs. `transfer` and `transferFrom` are called
///         through `_call`, so tokens that return nothing work too (F-2).
interface IERC20 {
    function balanceOf(address who) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title AgentCoop Coop Rail HTLC (Base side of the USDC -> BSV swap, FINAL-IDEA §4.10)
/// @notice The sender locks ERC-20 tokens for `receiver` under sha256(secret). The receiver
///         (or anyone) claims with the secret before `timeout`; after `timeout` the sender
///         gets them back. sha256, not keccak: the BSV side checks the same secret with OP_SHA256.
///         A lock records only what the contract received: a token that takes a fee on transfer
///         is refused, so one lock can never pay out another lock's tokens (F-1).
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
    uint256 private entered;

    modifier nonReentrant() {
        require(entered == 0, "reentrant call");
        entered = 1;
        _;
        entered = 0;
    }

    event Locked(bytes32 indexed id, address indexed sender, address indexed receiver, address token, uint256 amount, bytes32 hashlock, uint64 timeout);
    event Claimed(bytes32 indexed id, bytes32 secret);
    event Refunded(bytes32 indexed id);

    function lock(address receiver, address token, uint256 amount, bytes32 hashlock, uint64 timeout) external nonReentrant returns (bytes32 id) {
        require(receiver != address(0) && token != address(0), "zero address");
        require(amount > 0, "zero amount");
        require(timeout > block.timestamp, "timeout in the past");
        id = keccak256(abi.encode(msg.sender, receiver, token, amount, hashlock, timeout));
        require(locks[id].state == State.None, "lock exists");
        locks[id] = Lock(msg.sender, receiver, token, amount, hashlock, timeout, State.Locked);
        // Slither (reentrancy-balance, incorrect-equality), triaged in AUDIT-READINESS §7: the call cannot re-enter
        // (nonReentrant), and only the token itself can move its balance in between, which affects only its own locks.
        // The equality is the point: a token that delivers anything but `amount` is refused (F-1).
        uint256 before = IERC20(token).balanceOf(address(this));
        _call(token, abi.encodeCall(IERC20.transferFrom, (msg.sender, address(this), amount)), "transferFrom failed");
        // slither-disable-next-line reentrancy-balance,incorrect-equality
        require(IERC20(token).balanceOf(address(this)) - before == amount, "received less than amount");
        emit Locked(id, msg.sender, receiver, token, amount, hashlock, timeout);
    }

    function claim(bytes32 id, bytes32 secret) external nonReentrant {
        Lock storage l = locks[id];
        require(l.state == State.Locked, "not locked");
        require(block.timestamp < l.timeout, "expired");
        require(sha256(abi.encodePacked(secret)) == l.hashlock, "wrong secret");
        l.state = State.Claimed;
        _call(l.token, abi.encodeCall(IERC20.transfer, (l.receiver, l.amount)), "transfer failed");
        emit Claimed(id, secret);
    }

    function refund(bytes32 id) external nonReentrant {
        Lock storage l = locks[id];
        require(l.state == State.Locked, "not locked");
        require(block.timestamp >= l.timeout, "not expired");
        l.state = State.Refunded;
        _call(l.token, abi.encodeCall(IERC20.transfer, (l.sender, l.amount)), "transfer failed");
        emit Refunded(id);
    }

    /// @dev Safe ERC-20 call: the call must succeed and return nothing or `true` (F-2). An address
    ///      with no code never gets here: `lock`'s `balanceOf` call reverts for it first.
    function _call(address token, bytes memory data, string memory err) private {
        (bool ok, bytes memory ret) = token.call(data);
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), err);
    }
}
