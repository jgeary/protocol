pragma solidity ^0.4.21;


import "StandardToken.sol";

contract PreminedToken is StandardToken {
    string public symbol;
    string public  name;
    uint8 public decimals;

    constructor(string _symbol, uint8 _decimals, string _name) public {
        symbol = _symbol;
        decimals = _decimals;
        name = _name;
        totalSupply_ = 1000000 * 10**uint(decimals);
        balances[msg.sender] = totalSupply_;
        emit Transfer(address(0), msg.sender, totalSupply_);
    }
}

