// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

contract ChainlinkOracle {
    AggregatorV3Interface public immutable priceFeed;
    uint256 public immutable stalenessThreshold;

    constructor(address _feed, uint256 _stalenessThreshold) {
        require(_feed != address(0), "Invalid feed");
        require(_stalenessThreshold > 0, "Invalid threshold");
        priceFeed = AggregatorV3Interface(_feed);
        stalenessThreshold = _stalenessThreshold;
    }

    function getLatestPrice() external view returns (int256 price, uint256 updatedAt) {
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 _updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();
        require(block.timestamp - _updatedAt <= stalenessThreshold, "Stale price feed");
        require(answer > 0, "Invalid price");
        require(answeredInRound >= roundId, "Incomplete round");
        return (answer, _updatedAt);
    }

    function getDecimals() external view returns (uint8) {
        return priceFeed.decimals();
    }
}

contract MockAggregator {
    int256 public price;
    uint256 public updatedAt;
    uint8 public decimals = 8;

    constructor(int256 _price) {
        price = _price;
        updatedAt = block.timestamp;
    }

    function setPrice(int256 _price) external {
        price = _price;
        updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }

    function latestRoundData() external view returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        return (1, price, block.timestamp, updatedAt, 1);
    }
}