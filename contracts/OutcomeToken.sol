// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OutcomeToken is ERC1155, Ownable {
    uint256 public constant YES = 0;
    uint256 public constant NO  = 1;
    string public name = "Outcome Shares";

    event SharesMinted(address indexed to, uint256 id, uint256 amount);
    event SharesBurned(address indexed from, uint256 id, uint256 amount);

    constructor(address _owner)
        ERC1155("https://predict.dao/token/{id}.json")
        Ownable(_owner)
    {}

    function mint(address to, uint256 id, uint256 amount) external onlyOwner {
        require(id == YES || id == NO, "Invalid token id");
        _mint(to, id, amount, "");
        emit SharesMinted(to, id, amount);
    }

    function burn(address from, uint256 id, uint256 amount) external onlyOwner {
        require(id == YES || id == NO, "Invalid token id");
        _burn(from, id, amount);
        emit SharesBurned(from, id, amount);
    }
}