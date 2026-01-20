import { ethers } from "hardhat";

async function main() {
  const DataToken = await ethers.getContractFactory("DataToken");
  const token = await DataToken.deploy();
  await token.waitForDeployment();

  const DataRegistry = await ethers.getContractFactory("DataRegistry");
  const registry = await DataRegistry.deploy(await token.getAddress());
  await registry.waitForDeployment();

  console.log("DataToken:", await token.getAddress());
  console.log("DataRegistry:", await registry.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
