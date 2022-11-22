import { ethers, network } from "hardhat";
import BN from "bn.js"
import { ec as EC, curve } from "elliptic"
import params from "./parameters"

async function main() {
  const ec = new EC('alt_bn128')
  const noOfCandidates = params.noOfCandidates
  const noOfVoteBits = Math.floor(Math.log2(noOfCandidates)) + 1
  const noOfZeroBits = params.noOfZeroBits
  const question = params.question
  const candidates = params.candidates
  const accounts = network.config.accounts as string[]
  const organiserPrivKey = new BN(accounts[0].slice(2), 16)
  const organiserPubKey = ec.g.mul(organiserPrivKey)

  console.log('Deploying contract...')
  const evotingFactory = await ethers.getContractFactory('Evoting')
  const evoting = await evotingFactory.deploy(
    noOfCandidates,
    noOfVoteBits,
    noOfZeroBits,
    question,
    candidates,
    {
      x: '0x' + organiserPubKey.getX().toString(16),
      y: '0x' + organiserPubKey.getY().toString(16)
    }
  )
  await evoting.deployed()
  console.log(`Contract deployed at ${evoting.address}`)
  console.log('Listening for requests...')
  // set up listeners for organiser
  let k: BN, R_: curve.base.BasePoint
  evoting.on("RequestPoint", async (from) => {
    const keyPair = ec.genKeyPair()
    k = keyPair.getPrivate()
    R_ = keyPair.getPublic()
    await evoting.returnPoint(
      from,
      {
        x: R_.getX().toArray(),
        y: R_.getY().toArray()
      }
    )
  })
  evoting.on("RequestSignProof", async (from, m_) => {
    const s_ = organiserPrivKey.mul(new BN(m_.toString())).add(k).mod(ec.n!)
    await evoting.returnSignProof(
      from,
      s_.toArray()
    )
  })
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
