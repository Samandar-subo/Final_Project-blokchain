// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./OutcomeToken.sol";

contract PredictionMarket is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum MarketState { Open, Closed, Resolved }
    enum Outcome { None, YES, NO }

    struct Market {
        string question;
        uint256 endTime;
        uint256 yesShares;
        uint256 noShares;
        uint256 totalLiquidity;
        MarketState state;
        Outcome resolvedOutcome;
    }

    IERC20 public immutable collateral;
    OutcomeToken public immutable outcomeToken;
    address public oracle;

    uint256 public constant FEE_BPS = 30;
    uint256 public constant BPS = 10000;
    uint256 public constant INITIAL_LIQUIDITY = 1000 * 10**18;
    uint256 public constant SHARES_PER_BUY = 100 * 10**18;

    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => uint256)) public yesBalances;
    mapping(uint256 => mapping(address => uint256)) public noBalances;
    mapping(uint256 => uint256) public feesCollected;

    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime);
    event SharesBought(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 amount, uint256 cost);
    event SharesSold(uint256 indexed marketId, address indexed seller, bool isYes, uint256 amount, uint256 payout);
    event MarketResolved(uint256 indexed marketId, Outcome outcome);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 amount);

    modifier onlyOracle() { require(msg.sender == oracle, "Not oracle"); _; }
    modifier marketExists(uint256 id) { require(id < marketCount, "No market"); _; }
    modifier marketOpen(uint256 id) {
        require(markets[id].state == MarketState.Open, "Not open");
        require(block.timestamp < markets[id].endTime, "Ended");
        _;
    }

    constructor(address _collateral, address _oracle) Ownable(msg.sender) {
        require(_collateral != address(0), "Invalid collateral");
        require(_oracle != address(0), "Invalid oracle");
        collateral = IERC20(_collateral);
        oracle = _oracle;
        outcomeToken = new OutcomeToken(address(this));
    }

    function createMarket(string calldata question, uint256 duration)
        external onlyOwner returns (uint256 marketId)
    {
        require(duration > 0, "Invalid duration");
        require(bytes(question).length > 0, "Empty question");
        marketId = marketCount++;
        markets[marketId] = Market({
            question: question,
            endTime: block.timestamp + duration,
            yesShares: INITIAL_LIQUIDITY,
            noShares: INITIAL_LIQUIDITY,
            totalLiquidity: INITIAL_LIQUIDITY,
            state: MarketState.Open,
            resolvedOutcome: Outcome.None
        });
        collateral.safeTransferFrom(msg.sender, address(this), INITIAL_LIQUIDITY);
        emit MarketCreated(marketId, question, block.timestamp + duration);
    }

    function buyShares(uint256 marketId, bool isYes, uint256 maxCost)
        external nonReentrant marketExists(marketId) marketOpen(marketId)
    {
        Market storage market = markets[marketId];
        uint256 cost = _calculateCost(market, isYes, SHARES_PER_BUY);
        uint256 fee = cost * FEE_BPS / BPS;
        uint256 totalCost = cost + fee;
        require(totalCost <= maxCost, "Slippage exceeded");

        if (isYes) {
            market.yesShares += SHARES_PER_BUY;
            yesBalances[marketId][msg.sender] += SHARES_PER_BUY;
        } else {
            market.noShares += SHARES_PER_BUY;
            noBalances[marketId][msg.sender] += SHARES_PER_BUY;
        }
        feesCollected[marketId] += fee;

        collateral.safeTransferFrom(msg.sender, address(this), totalCost);
        outcomeToken.mint(msg.sender, isYes ? 0 : 1, SHARES_PER_BUY);
        emit SharesBought(marketId, msg.sender, isYes, SHARES_PER_BUY, totalCost);
    }

    function sellShares(uint256 marketId, bool isYes, uint256 amount)
        external nonReentrant marketExists(marketId) marketOpen(marketId)
    {
        Market storage market = markets[marketId];
        uint256 userBalance = isYes ? yesBalances[marketId][msg.sender] : noBalances[marketId][msg.sender];
        require(userBalance >= amount, "Insufficient shares");

        uint256 payout = _calculatePayout(market, isYes, amount);
        uint256 fee = payout * FEE_BPS / BPS;
        uint256 netPayout = payout - fee;

        if (isYes) {
            market.yesShares -= amount;
            yesBalances[marketId][msg.sender] -= amount;
        } else {
            market.noShares -= amount;
            noBalances[marketId][msg.sender] -= amount;
        }
        feesCollected[marketId] += fee;

        outcomeToken.burn(msg.sender, isYes ? 0 : 1, amount);
        collateral.safeTransfer(msg.sender, netPayout);
        emit SharesSold(marketId, msg.sender, isYes, amount, netPayout);
    }

    function resolveMarket(uint256 marketId, bool yesWins)
        external onlyOracle marketExists(marketId)
    {
        Market storage market = markets[marketId];
        require(market.state == MarketState.Open, "Already resolved");
        require(block.timestamp >= market.endTime, "Still active");
        market.state = MarketState.Resolved;
        market.resolvedOutcome = yesWins ? Outcome.YES : Outcome.NO;
        emit MarketResolved(marketId, market.resolvedOutcome);
    }

    function claimWinnings(uint256 marketId)
        external nonReentrant marketExists(marketId)
    {
        Market storage market = markets[marketId];
        require(market.state == MarketState.Resolved, "Not resolved");
        bool isYesWinner = market.resolvedOutcome == Outcome.YES;
        uint256 winningShares = isYesWinner
            ? yesBalances[marketId][msg.sender]
            : noBalances[marketId][msg.sender];
        require(winningShares > 0, "No winning shares");

        if (isYesWinner) { yesBalances[marketId][msg.sender] = 0; }
        else { noBalances[marketId][msg.sender] = 0; }

        uint256 totalWinningShares = isYesWinner ? market.yesShares : market.noShares;
        uint256 totalPool = collateral.balanceOf(address(this));
        uint256 payout = winningShares * totalPool / totalWinningShares;
        collateral.safeTransfer(msg.sender, payout);
        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    function _calculateCost(Market storage market, bool isYes, uint256 shares)
        internal view returns (uint256)
    {
        uint256 k = market.yesShares * market.noShares;
        if (isYes) {
            uint256 newYes = market.yesShares + shares;
            uint256 newNo = k / newYes;
            return market.noShares - newNo;
        } else {
            uint256 newNo = market.noShares + shares;
            uint256 newYes = k / newNo;
            return market.yesShares - newYes;
        }
    }

    function _calculatePayout(Market storage market, bool isYes, uint256 shares)
        internal view returns (uint256)
    {
        uint256 k = market.yesShares * market.noShares;
        if (isYes) {
            uint256 newYes = market.yesShares - shares;
            uint256 newNo = k / newYes;
            return newNo - market.noShares;
        } else {
            uint256 newNo = market.noShares - shares;
            uint256 newYes = k / newNo;
            return newYes - market.yesShares;
        }
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    function getPrice(uint256 marketId, bool isYes) external view returns (uint256) {
        Market storage market = markets[marketId];
        uint256 total = market.yesShares + market.noShares;
        return isYes ? market.yesShares * 1e18 / total : market.noShares * 1e18 / total;
    }
}
