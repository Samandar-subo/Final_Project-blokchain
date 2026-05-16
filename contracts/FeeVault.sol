// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FeeVault is ERC4626, Ownable {
    uint256 public totalFeesDeposited;
    event FeesDeposited(address indexed from, uint256 amount);

    constructor(address _asset)
        ERC4626(IERC20(_asset))
        ERC20("Vault Share", "vPRED")
        Ownable(msg.sender)
    {}

    function depositFees(uint256 amount) external onlyOwner {
        require(amount > 0, "Zero amount");
        totalFeesDeposited += amount;
        IERC20(asset()).transferFrom(msg.sender, address(this), amount);
        emit FeesDeposited(msg.sender, amount);
    }

    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }
}
