// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GovernanceToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    uint256 public constant TOTAL_SUPPLY = 1_000_000 * 10**18;

    constructor(address team, address treasury, address community, address liquidity)
        ERC20("PredictToken", "PRED")
        ERC20Permit("PredictToken")
        Ownable(msg.sender)
    {
        _mint(team,      TOTAL_SUPPLY * 40 / 100);
        _mint(treasury,  TOTAL_SUPPLY * 30 / 100);
        _mint(community, TOTAL_SUPPLY * 20 / 100);
        _mint(liquidity, TOTAL_SUPPLY * 10 / 100);
    }

    function _update(address from, address to, uint256 value)
        internal override(ERC20, ERC20Votes)
    { super._update(from, to, value); }

    function nonces(address owner)
        public view override(ERC20Permit, Nonces) returns (uint256)
    { return super.nonces(owner); }
}