import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("PredictionMarket", function () {
  async function deployFixture() {
    const [owner, oracle, buyer1, buyer2, voter1] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("GovernanceToken");
    const token = await Token.deploy(voter1.address, owner.address, buyer1.address, buyer2.address);
    const Market = await ethers.getContractFactory("PredictionMarket");
    const market = await Market.deploy(await token.getAddress(), oracle.address);
    const outcomeToken = await ethers.getContractAt("OutcomeToken", await market.outcomeToken());
    await token.connect(owner).approve(await market.getAddress(), ethers.parseEther("1000000"));
    await token.connect(buyer1).approve(await market.getAddress(), ethers.parseEther("1000000"));
    await token.connect(buyer2).approve(await market.getAddress(), ethers.parseEther("1000000"));
    return { token, market, outcomeToken, owner, oracle, buyer1, buyer2, voter1 };
  }

  it("Should create a market", async function () {
    const { market, owner } = await deployFixture();
    await market.connect(owner).createMarket("Will ETH reach $5000?", 86400);
    expect(await market.marketCount()).to.equal(1n);
  });

  it("Should set correct initial liquidity", async function () {
    const { market, owner } = await deployFixture();
    await market.connect(owner).createMarket("Test market", 86400);
    const m = await market.getMarket(0);
    expect(m.yesShares).to.equal(ethers.parseEther("1000"));
    expect(m.noShares).to.equal(ethers.parseEther("1000"));
  });

  it("Should fail with empty question", async function () {
    const { market, owner } = await deployFixture();
    await expect(market.connect(owner).createMarket("", 86400)).to.be.revertedWith("Empty question");
  });

  it("Should fail with zero duration", async function () {
    const { market, owner } = await deployFixture();
    await expect(market.connect(owner).createMarket("Test", 0)).to.be.revertedWith("Invalid duration");
  });

  it("Should only allow owner to create market", async function () {
    const { market, buyer1 } = await deployFixture();
    await expect(market.connect(buyer1).createMarket("Test", 86400)).to.be.reverted;
  });

  it("Should buy YES shares", async function () {
    const { market, owner, buyer1 } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await market.connect(buyer1).buyShares(0, true, ethers.parseEther("1000"));
    expect(await market.yesBalances(0, buyer1.address)).to.equal(ethers.parseEther("100"));
  });

  it("Should buy NO shares", async function () {
    const { market, owner, buyer1 } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await market.connect(buyer1).buyShares(0, false, ethers.parseEther("1000"));
    expect(await market.noBalances(0, buyer1.address)).to.equal(ethers.parseEther("100"));
  });

  it("Should mint ERC1155 outcome tokens on buy", async function () {
    const { market, outcomeToken, owner, buyer1 } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await market.connect(buyer1).buyShares(0, true, ethers.parseEther("1000"));
    expect(await outcomeToken.balanceOf(buyer1.address, 0)).to.equal(ethers.parseEther("100"));
  });

  it("Should revert if slippage exceeded", async function () {
    const { market, owner, buyer1 } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await expect(market.connect(buyer1).buyShares(0, true, ethers.parseEther("1"))).to.be.revertedWith("Slippage exceeded");
  });

  it("Should collect fees on buy", async function () {
    const { market, owner, buyer1 } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await market.connect(buyer1).buyShares(0, true, ethers.parseEther("1000"));
    expect(await market.feesCollected(0)).to.be.gt(0n);
  });

  it("Should sell YES shares", async function () {
    const { market, owner, buyer1, token } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await market.connect(buyer1).buyShares(0, true, ethers.parseEther("1000"));
    const balanceBefore = await token.balanceOf(buyer1.address);
    await market.connect(buyer1).sellShares(0, true, ethers.parseEther("100"));
    expect(await token.balanceOf(buyer1.address)).to.be.gt(balanceBefore);
  });

  it("Should fail selling more than owned", async function () {
    const { market, owner, buyer1 } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await market.connect(buyer1).buyShares(0, true, ethers.parseEther("1000"));
    await expect(market.connect(buyer1).sellShares(0, true, ethers.parseEther("999"))).to.be.revertedWith("Insufficient shares");
  });

  it("Should return 50/50 price initially", async function () {
    const { market, owner } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    expect(await market.getPrice(0, true)).to.equal(ethers.parseEther("0.5"));
    expect(await market.getPrice(0, false)).to.equal(ethers.parseEther("0.5"));
  });

  it("Should update price after buying YES", async function () {
    const { market, owner, buyer1 } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await market.connect(buyer1).buyShares(0, true, ethers.parseEther("1000"));
    expect(await market.getPrice(0, true)).to.be.gt(ethers.parseEther("0.5"));
  });

  it("Should resolve market YES", async function () {
    const { market, owner, oracle } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await time.increase(86401);
    await market.connect(oracle).resolveMarket(0, true);
    const m = await market.getMarket(0);
    expect(m.resolvedOutcome).to.equal(1n);
  });

  it("Should resolve market NO", async function () {
    const { market, owner, oracle } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await time.increase(86401);
    await market.connect(oracle).resolveMarket(0, false);
    const m = await market.getMarket(0);
    expect(m.resolvedOutcome).to.equal(2n);
  });

  it("Should fail resolve before end time", async function () {
    const { market, owner, oracle } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await expect(market.connect(oracle).resolveMarket(0, true)).to.be.revertedWith("Still active");
  });

  it("Should fail resolve by non-oracle", async function () {
    const { market, owner, buyer1 } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await time.increase(86401);
    await expect(market.connect(buyer1).resolveMarket(0, true)).to.be.revertedWith("Not oracle");
  });

  it("Should claim winnings for YES winner", async function () {
    const { market, owner, oracle, buyer1, token } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await market.connect(buyer1).buyShares(0, true, ethers.parseEther("1000"));
    await time.increase(86401);
    await market.connect(oracle).resolveMarket(0, true);
    const balanceBefore = await token.balanceOf(buyer1.address);
    await market.connect(buyer1).claimWinnings(0);
    expect(await token.balanceOf(buyer1.address)).to.be.gt(balanceBefore);
  });

  it("Should fail claim with no winning shares", async function () {
    const { market, owner, oracle, buyer1 } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await market.connect(buyer1).buyShares(0, true, ethers.parseEther("1000"));
    await time.increase(86401);
    await market.connect(oracle).resolveMarket(0, false);
    await expect(market.connect(buyer1).claimWinnings(0)).to.be.revertedWith("No winning shares");
  });

  it("Should fail double claim", async function () {
    const { market, owner, oracle, buyer1 } = await deployFixture();
    await market.connect(owner).createMarket("Test", 86400);
    await market.connect(buyer1).buyShares(0, true, ethers.parseEther("1000"));
    await time.increase(86401);
    await market.connect(oracle).resolveMarket(0, true);
    await market.connect(buyer1).claimWinnings(0);
    await expect(market.connect(buyer1).claimWinnings(0)).to.be.revertedWith("No winning shares");
  });
});

describe("GovernanceToken", function () {
  async function deployFixture() {
    const [owner, team, treasury, community, liquidity, user1] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("GovernanceToken");
    const token = await Token.deploy(team.address, treasury.address, community.address, liquidity.address);
    return { token, owner, team, treasury, community, liquidity, user1 };
  }

  it("Should distribute tokens correctly", async function () {
    const { token, team, treasury, community, liquidity } = await deployFixture();
    const TOTAL = ethers.parseEther("1000000");
    expect(await token.balanceOf(team.address)).to.equal(TOTAL * 40n / 100n);
    expect(await token.balanceOf(treasury.address)).to.equal(TOTAL * 30n / 100n);
    expect(await token.balanceOf(community.address)).to.equal(TOTAL * 20n / 100n);
    expect(await token.balanceOf(liquidity.address)).to.equal(TOTAL * 10n / 100n);
  });

  it("Should have correct name and symbol", async function () {
    const { token } = await deployFixture();
    expect(await token.name()).to.equal("PredictToken");
    expect(await token.symbol()).to.equal("PRED");
  });

  it("Should allow delegation", async function () {
    const { token, team } = await deployFixture();
    await token.connect(team).delegate(team.address);
    expect(await token.getVotes(team.address)).to.equal(ethers.parseEther("400000"));
  });

  it("Should delegate to another address", async function () {
    const { token, team, user1 } = await deployFixture();
    await token.connect(team).delegate(user1.address);
    expect(await token.getVotes(user1.address)).to.equal(ethers.parseEther("400000"));
  });

  it("Should have zero votes before delegation", async function () {
    const { token, team } = await deployFixture();
    expect(await token.getVotes(team.address)).to.equal(0n);
  });
});

describe("ChainlinkOracle", function () {
  async function deployFixture() {
    const Mock = await ethers.getContractFactory("MockAggregator");
    const mock = await Mock.deploy(100000000);
    const Oracle = await ethers.getContractFactory("ChainlinkOracle");
    const oracle = await Oracle.deploy(await mock.getAddress(), 3600);
    return { mock, oracle };
  }

  it("Should return latest price", async function () {
    const { oracle } = await deployFixture();
    const [price] = await oracle.getLatestPrice();
    expect(price).to.equal(100000000n);
  });

  it("Should revert on stale price", async function () {
    const { mock, oracle } = await deployFixture();
    await mock.setUpdatedAt(0);
    await expect(oracle.getLatestPrice()).to.be.revertedWith("Stale price feed");
  });

  it("Should revert on negative price", async function () {
    const { mock, oracle } = await deployFixture();
    await mock.setPrice(-1);
    await expect(oracle.getLatestPrice()).to.be.revertedWith("Invalid price");
  });

  it("Should return correct decimals", async function () {
    const { oracle } = await deployFixture();
    expect(await oracle.getDecimals()).to.equal(8n);
  });
});

describe("FeeVault (ERC-4626)", function () {
  async function deployFixture() {
    const [owner] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("GovernanceToken");
    const token = await Token.deploy(owner.address, owner.address, owner.address, owner.address);
    const Vault = await ethers.getContractFactory("FeeVault");
    const vault = await Vault.deploy(await token.getAddress());
    await token.approve(await vault.getAddress(), ethers.parseEther("1000000"));
    return { token, vault, owner };
  }

  it("Should have correct asset", async function () {
    const { vault, token } = await deployFixture();
    expect(await vault.asset()).to.equal(await token.getAddress());
  });

  it("Should deposit and mint shares", async function () {
    const { vault, owner } = await deployFixture();
    await vault.deposit(ethers.parseEther("1000"), owner.address);
    expect(await vault.balanceOf(owner.address)).to.be.gt(0n);
  });

  it("Should withdraw assets", async function () {
    const { vault, token, owner } = await deployFixture();
    await vault.deposit(ethers.parseEther("1000"), owner.address);
    const shares = await vault.balanceOf(owner.address);
    await vault.redeem(shares, owner.address, owner.address);
    expect(await token.balanceOf(owner.address)).to.be.gt(0n);
  });

  it("Should report correct total assets", async function () {
    const { vault, owner } = await deployFixture();
    await vault.deposit(ethers.parseEther("500"), owner.address);
    expect(await vault.totalAssets()).to.equal(ethers.parseEther("500"));
  });
});

describe("MarketFactory", function () {
  async function deployFixture() {
    const [owner, oracle] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("GovernanceToken");
    const token = await Token.deploy(owner.address, owner.address, owner.address, owner.address);
    const Factory = await ethers.getContractFactory("MarketFactory");
    const factory = await Factory.deploy(await token.getAddress(), oracle.address);
    return { token, factory, owner, oracle };
  }

  it("Should deploy market with CREATE", async function () {
    const { factory } = await deployFixture();
    await factory.deployMarket();
    expect(await factory.marketCount()).to.equal(1n);
  });

  it("Should deploy market with CREATE2", async function () {
    const { factory } = await deployFixture();
    await factory.deployMarketCreate2(42);
    expect(await factory.marketCount()).to.equal(1n);
  });

  it("Should predict CREATE2 address", async function () {
    const { factory } = await deployFixture();
    const predicted = await factory.predictAddress(99);
    await factory.deployMarketCreate2(99);
    const markets = await factory.getAllMarkets();
    expect(markets[0]).to.equal(predicted);
  });

  it("Should track all markets", async function () {
    const { factory } = await deployFixture();
    await factory.deployMarket();
    await factory.deployMarket();
    expect((await factory.getAllMarkets()).length).to.equal(2);
  });
});
