import { ethers } from "hardhat";

async function main() {
  const [deployer, team, treasury, community, liquidity] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. GovernanceToken
  console.log("\n1. Deploying GovernanceToken...");
  const Token = await ethers.getContractFactory("GovernanceToken");
  const token = await Token.deploy(
    team.address, treasury.address, community.address, liquidity.address
  );
  await token.waitForDeployment();
  console.log("GovernanceToken:", await token.getAddress());

  // 2. TimelockController
  console.log("\n2. Deploying TimelockController...");
  const Timelock = await ethers.getContractFactory("TimelockController");
  const timelock = await Timelock.deploy(172800, [], [], deployer.address);
  await timelock.waitForDeployment();
  console.log("TimelockController:", await timelock.getAddress());

  // 3. MyGovernor
  console.log("\n3. Deploying MyGovernor...");
  const Governor = await ethers.getContractFactory("MyGovernor");
  const governor = await Governor.deploy(
    await token.getAddress(), await timelock.getAddress()
  );
  await governor.waitForDeployment();
  console.log("MyGovernor:", await governor.getAddress());

  // 4. Treasury
  console.log("\n4. Deploying Treasury...");
  const TreasuryFactory = await ethers.getContractFactory("Treasury");
  const treasuryContract = await TreasuryFactory.deploy(await timelock.getAddress());
  await treasuryContract.waitForDeployment();
  console.log("Treasury:", await treasuryContract.getAddress());

  // 5. MockAggregator (for testnet)
  console.log("\n5. Deploying MockAggregator...");
  const Mock = await ethers.getContractFactory("MockAggregator");
  const mock = await Mock.deploy(100000000); // $1.00
  await mock.waitForDeployment();
  console.log("MockAggregator:", await mock.getAddress());

  // 6. ChainlinkOracle
  console.log("\n6. Deploying ChainlinkOracle...");
  const Oracle = await ethers.getContractFactory("ChainlinkOracle");
  const oracle = await Oracle.deploy(await mock.getAddress(), 3600);
  await oracle.waitForDeployment();
  console.log("ChainlinkOracle:", await oracle.getAddress());

  // 7. PredictionMarket
  console.log("\n7. Deploying PredictionMarket...");
  const Market = await ethers.getContractFactory("PredictionMarket");
  const market = await Market.deploy(
    await token.getAddress(), deployer.address
  );
  await market.waitForDeployment();
  console.log("PredictionMarket:", await market.getAddress());

  // 8. MarketFactory
  console.log("\n8. Deploying MarketFactory...");
  const Factory = await ethers.getContractFactory("MarketFactory");
  const factory = await Factory.deploy(
    await token.getAddress(), deployer.address
  );
  await factory.waitForDeployment();
  console.log("MarketFactory:", await factory.getAddress());

  // 9. FeeVault
  console.log("\n9. Deploying FeeVault...");
  const Vault = await ethers.getContractFactory("FeeVault");
  const vault = await Vault.deploy(await token.getAddress());
  await vault.waitForDeployment();
  console.log("FeeVault:", await vault.getAddress());

  // 10. MarketRegistry (UUPS Proxy)
  console.log("\n10. Deploying MarketRegistry (UUPS)...");
  const Registry = await ethers.getContractFactory("MarketRegistryV1");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  console.log("MarketRegistryV1:", await registry.getAddress());

  // 11. Setup Timelock roles
  console.log("\n11. Setting up roles...");
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
  await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress());
  await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress);
  await timelock.revokeRole(ADMIN_ROLE, deployer.address);
  console.log("Roles configured!");

  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log("GovernanceToken:", await token.getAddress());
  console.log("TimelockController:", await timelock.getAddress());
  console.log("MyGovernor:", await governor.getAddress());
  console.log("Treasury:", await treasuryContract.getAddress());
  console.log("MockAggregator:", await mock.getAddress());
  console.log("ChainlinkOracle:", await oracle.getAddress());
  console.log("PredictionMarket:", await market.getAddress());
  console.log("MarketFactory:", await factory.getAddress());
  console.log("FeeVault:", await vault.getAddress());
  console.log("MarketRegistryV1:", await registry.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});