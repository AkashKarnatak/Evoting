import { ethers } from "hardhat";

async function main() {
  console.log('Deploying contract...')
  const evotingFactory = await ethers.getContractFactory('Evoting')
  const noOfCandidates = 10
  const noOfVoteBits = Math.floor(Math.log2(noOfCandidates)) + 1
  const noOfZeroBits = 10
  const evoting = await evotingFactory.deploy(noOfCandidates, noOfVoteBits, noOfZeroBits)
  await evoting.deployed()
  console.log(`Contract deployed at ${evoting.address}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
