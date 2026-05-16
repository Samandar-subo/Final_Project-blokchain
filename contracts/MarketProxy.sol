// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract MarketRegistryV1 is OwnableUpgradeable, UUPSUpgradeable {
    mapping(uint256 => address) public markets;
    uint256 public marketCount;
    string public version;

    event MarketRegistered(uint256 indexed id, address market);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner) public initializer {
        __Ownable_init(_owner);
        version = "V1";
    }

    function registerMarket(address market) external onlyOwner {
        require(market != address(0), "Invalid market");
        markets[marketCount] = market;
        emit MarketRegistered(marketCount, market);
        marketCount++;
    }

    function getMarket(uint256 id) external view returns (address) {
        return markets[id];
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}

contract MarketRegistryV2 is MarketRegistryV1 {
    mapping(address => bool) public verifiedMarkets;
    event MarketVerified(address indexed market);

    function initializeV2() external onlyOwner {
        version = "V2";
    }

    function verifyMarket(address market) external onlyOwner {
        verifiedMarkets[market] = true;
        emit MarketVerified(market);
    }
}