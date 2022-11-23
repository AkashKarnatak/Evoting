import { ethers, network } from "hardhat"
import BN from "bn.js"
import { ec as EC, curve } from "elliptic"
import { Evoting } from "../typechain-types"
import { expect } from "chai"

const ec = new EC('alt_bn128')

describe("Evoting", () => {
  let evoting: Evoting, organiserPrivKey: BN, organiserPubKey: curve.base.BasePoint
  beforeEach(async () => {
    const noOfCandidates = 2
    const noOfVoteBits = Math.floor(Math.log2(noOfCandidates)) + 1
    const noOfZeroBits = 10
    const question = "Who do you want to vote for?"
    const candidates = ["Abhishek", "Akash"]
    const accounts = network.config.accounts as string[]
    organiserPrivKey = new BN(accounts[0].slice(2), 16)
    organiserPubKey = ec.g.mul(organiserPrivKey)

    const evotingFactory = await ethers.getContractFactory('Evoting')
    evoting = await evotingFactory.deploy(
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
    // set up listeners for organiser
    let k: BN, R_: curve.base.BasePoint
    evoting.once("RequestPoint", async (from) => {
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
    evoting.once("RequestSignProof", async (from, m_) => {
      const s_ = organiserPrivKey.mul(new BN(m_.toString())).add(k).mod(ec.n!)
      await evoting.returnSignProof(
        from,
        s_.toArray()
      )
    })
  })

  it("All vote bits should add to 256", async () => {
    const noOfVoteBits = (await evoting.noOfVoteBits()).toNumber()
    const noOfZeroBits = (await evoting.noOfZeroBits()).toNumber()
    const noOfRandomBits = (await evoting.noOfRandomBits()).toNumber()
    expect(noOfVoteBits + noOfZeroBits + noOfRandomBits).to.equal(256)
  })

  it("Should have valid organiser's public key", async () => {
    const organiserPubKey = await evoting.organiserPubKey()
    expect(organiserPubKey.x).to.gt(0)
    expect(organiserPubKey.y).to.gt(0)
  })

  const createRandomWallet = async () => {
    const wallet = ethers.Wallet.createRandom().connect(ethers.provider)
    const owner = (await ethers.getSigners())[0]
    owner.sendTransaction({ to: wallet.address, value: ethers.utils.parseEther("1") });
    return wallet
  }

  describe("Registration phase", () => {
    it("Should be able to register for vote", async () => {
      const wallet = await createRandomWallet()
      const evotingClient = evoting.connect(wallet)
      await evotingClient.registerVoter()
      expect(await evotingClient.registeredVoters(wallet.address)).to.equal(true)
    })
  })

  function randomNumber(bits: Number): bigint {
    let r = '0b'
    for (let i = 0; i < bits; ++i) {
      r += Math.floor(Math.random() * 2)
    }
    return BigInt(r)
  }

  async function collectSignature(evotingClient: Evoting, voteHash: BN, address: string) {
    return new Promise<Evoting.SignatureStruct>(async (resolve) => {
      let a: BN, b: BN, R: curve.base.BasePoint
      // register listeners for client
      evotingClient.once(evotingClient.filters.ReturnPoint(address), async (_, _R_) => {
        a = new BN(crypto.getRandomValues(new Uint8Array(32)))
        b = new BN(crypto.getRandomValues(new Uint8Array(32)))
        const R_ = ec.keyFromPublic({
          x: _R_.x.toHexString().slice(2),
          y: _R_.y.toHexString().slice(2),
        }, 'hex').getPublic()
        R = R_.mul(a).add(ec.g.mul(b))
        const m_ = a.invm(ec.n!).mul(R.getX()).mul(voteHash).mod(ec.n!)
        await evotingClient.requestSignProof(m_.toArray())
      })
      evotingClient.once(evotingClient.filters.ReturnSignProof(address), async (_, s_) => {
        const s = (new BN(s_.toString())).mul(a).add(b).mod(ec.n!)
        const signature = {
          R: {
            x: BigInt(R.getX().toString()),
            y: BigInt(R.getY().toString())
          },
          s: BigInt(s.toString())
        }
        resolve(signature)
      })
      await evotingClient.requestPoint()
    })
  }

  function verifySignature(voteHash: BN, signature: Evoting.SignatureStruct) {
    const R = ec.keyFromPublic({
      x: signature.R.x.toString(16),
      y: signature.R.y.toString(16),
    }, 'hex').getPublic()
    const lhs: curve.base.BasePoint = ec.g.mul(new BN(signature.s.toString()))
    const rhs: curve.base.BasePoint = R.add(organiserPubKey.mul(R.getX().mul(voteHash)))
    return (lhs.getX().toString() == rhs.getX().toString()) && (lhs.getY().toString() == rhs.getY().toString())
  }

  describe("Pre-voting phase", () => {
    it("Should not be able to request params if not registered", async () => {
      const wallet = await createRandomWallet()
      const evotingClient = evoting.connect(wallet)
      try {
        await evotingClient.requestPoint()
        expect(true).to.not.equal(true)
      } catch (e) {
        expect(e).to.not.equal(undefined)
      }
      try {
        await evotingClient.requestSignProof(BigInt(1))
        expect(true).to.not.equal(true)
      } catch (e) {
        expect(e).to.not.equal(undefined)
      }
    })

    it("Should be able to request params if registered", async () => {
      const wallet = await createRandomWallet()
      const evotingClient = evoting.connect(wallet)
      await evotingClient.registerVoter()
      await new Promise<void>((resolve) => {
        evoting.once(evoting.filters.RequestPoint(), (from) => {
          expect(from).to.equal(wallet.address)
          resolve()
        })
        evotingClient.connect(wallet).requestPoint()
      })
    })

    it("Should receive valid signature from organiser", async () => {
      const wallet = await createRandomWallet()
      const evotingClient = evoting.connect(wallet)
      await evotingClient.registerVoter()

      const noOfZeroBits = (await evotingClient.noOfZeroBits()).toNumber()
      const noOfRandomBits = (await evotingClient.noOfRandomBits()).toNumber()
      const choice = BigInt(1)
      const vote = (choice << BigInt(noOfZeroBits + noOfRandomBits)) + randomNumber(noOfRandomBits)
      const voteHash = new BN(ethers.utils.solidityKeccak256(['uint256'], [vote]).slice(2), 16)
      const signature = await collectSignature(evotingClient, voteHash, wallet.address)
      const isSigValid = verifySignature(voteHash, signature)
      expect(isSigValid).to.equal(true)
    })
  })

  describe("Ballot casting", () => {
    it("Should not be able to cast vote if not registered", async () => {
      const wallet = await createRandomWallet()
      const evotingClient = evoting.connect(wallet)

      const noOfZeroBits = (await evotingClient.noOfZeroBits()).toNumber()
      const noOfRandomBits = (await evotingClient.noOfRandomBits()).toNumber()
      const choice = BigInt(1)
      const vote = (choice << BigInt(noOfZeroBits + noOfRandomBits)) + randomNumber(noOfRandomBits)
      const signature = {
        R: {
          x: [
            12, 218, 129, 179, 237, 162, 41, 187,
            255, 232, 64, 227, 77, 255, 247, 110,
            166, 102, 46, 132, 133, 70, 228, 82,
            248, 97, 56, 81, 200, 250, 99, 28
          ],
          y: [
            44, 32, 185, 193, 104, 244, 0, 91,
            42, 130, 129, 99, 32, 41, 109, 87,
            194, 106, 48, 220, 170, 60, 3, 126,
            141, 167, 176, 221, 103, 195, 177, 26
          ]
        },
        s: [
          15, 65, 246, 63, 204, 63, 237, 79,
          183, 20, 32, 161, 36, 209, 9, 133,
          161, 109, 220, 168, 222, 211, 101, 140,
          2, 234, 72, 129, 167, 248, 234, 224
        ]
      }
      try {
        await evotingClient.castVote(vote, signature)
      } catch (e) {
        expect(e).to.not.equal(undefined)
      }
    })

    it("Should be able to cast vote if registered", async () => {
      const wallet = await createRandomWallet()
      const evotingClient = evoting.connect(wallet)
      await evotingClient.registerVoter()

      const vote = BigInt('28966101094071922849285315159480065542707090692173565336668914111693165832278')
      const signature = {
        R: {
          x: [
            31, 65, 198, 38, 4, 129, 21, 80,
            209, 45, 150, 159, 176, 88, 188, 226,
            124, 122, 137, 83, 204, 55, 155, 196,
            134, 255, 135, 52, 100, 117, 213, 98
          ],
          y: [
            33, 66, 239, 204, 87, 195, 138,
            223, 165, 96, 218, 216, 203, 170,
            40, 240, 184, 146, 21, 25, 40,
            254, 175, 132, 245, 186, 90, 126,
            226, 194, 166, 118
          ]
        },
        s: [
          10, 182, 182, 170, 154, 123, 110, 90,
          213, 25, 20, 228, 76, 177, 229, 172,
          1, 32, 63, 48, 212, 189, 227, 242,
          222, 233, 44, 213, 185, 73, 22, 42
        ]
      }
      try {
        const transactionReponse = await evotingClient.castVote(vote, signature)
        expect(transactionReponse).to.not.equal(undefined)
      } catch (e) {
        expect(e).to.equal(undefined)
      }
    })
  })
})
