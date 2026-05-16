// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./PredictionMarket.sol";

contract MarketFactory is Ownable {
    address public collateral;
    address public oracle;
    address[] public allMarkets;
    mapping(address => bool) public isMarket;

    event MarketDeployed(address indexed market, address deployer, uint256 indexed salt);

    constructor(address _collateral, address _oracle) Ownable(msg.sender) {
        require(_collateral != address(0), "Invalid collateral");
        require(_oracle != address(0), "Invalid oracle");
        collateral = _collateral;
        oracle = _oracle;
    }

    function deployMarket() external onlyOwner returns (address market) {
        PredictionMarket pm = new PredictionMarket(collateral, oracle);
        pm.transferOwnership(msg.sender);
        market = address(pm);
        allMarkets.push(market);
        isMarket[market] = true;
        emit MarketDeployed(market, msg.sender, 0);
    }

    function deployMarketCreate2(uint256 salt) external onlyOwner returns (address market) {
        bytes memory bytecode = abi.encodePacked(
            type(PredictionMarket).creationCode,
            abi.encode(collateral, oracle)
        );
        assembly {
            market := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        require(market != address(0), "CREATE2 failed");
        PredictionMarket(market).transferOwnership(msg.sender);
        allMarkets.push(market);
        isMarket[market] = true;
        emit MarketDeployed(market, msg.sender, salt);
    }

    function predictAddress(uint256 salt) external view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(PredictionMarket).creationCode,
            abi.encode(collateral, oracle)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );
        return address(uint160(uint256(hash)));
    }

    function getAllMarkets() external view returns (address[] memory) {
        return allMarkets;
    }

    function marketCount() external view returns (uint256) {
        return allMarkets.length;
    }
}
