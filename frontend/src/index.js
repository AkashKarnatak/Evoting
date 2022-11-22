const { ethers } = require("ethers")
const { abi, contractAddress } = require("./constants")
const EC = require('elliptic').ec
const BN = require('bn.js')

const ec = EC('alt_bn128')

const $ = (x) => document.querySelector(x)

const walletConnected = () => {
  if (typeof window.ethereum === "undefined") {
    alert('Please install metamask')
    return false
  }
  return true
}

const randomNumber = (bits) => {
  let r = '0b'
  for (let i = 0; i < bits; ++i) {
    r += Math.floor(Math.random() * 2)
  }
  return BigInt(r)
}

const collectSignature = async (evoting, voteHash, address) => {
  return new Promise(async (resolve) => {
    let a, b, R
    // register listeners for client
    evoting.once(evoting.filters.ReturnPoint(address), async (_, _R_) => {
      console.log('Received point')
      a = new BN(crypto.getRandomValues(new Uint8Array(32)))
      b = new BN(crypto.getRandomValues(new Uint8Array(32)))
      const R_ = ec.keyFromPublic({
        x: _R_.x.toHexString().slice(2),
        y: _R_.y.toHexString().slice(2),
      }, 'hex').getPublic()
      R = R_.mul(a).add(ec.g.mul(b))
      const m_ = a.invm(ec.n).mul(R.getX()).mul(voteHash).mod(ec.n)
      console.log('Requesting signature proof...')
      await evoting.requestSignProof(m_.toArray())
    })
    evoting.once(evoting.filters.ReturnSignProof(address), async (_, s_) => {
      console.log('Received signature')
      const s = (new BN(s_.toString())).mul(a).add(b).mod(ec.n)
      const signature = {
        R: {
          x: R.getX().toArray(),
          y: R.getY().toArray()
        },
        s: s.toArray()
      }
      resolve(signature)
    })
    console.log('Requesting point...')
    await evoting.requestPoint()
  })
}

const listenForTransaction = (transactionResponse, provider) => {
  console.log(`Mining ${transactionResponse.hash}...`)
  return new Promise(resolve => {
    try {
      provider.once(transactionResponse.hash, (transactionReceipt) => {
        console.log(`Complete with ${transactionReceipt.confirmations} confirmations`)
        resolve()
      })
    } catch (e) {
      reject(e)
    }
  })
}

const connectWallet = async () => {
  if (!walletConnected()) return
  try {
    await ethereum.request({ method: "eth_requestAccounts" })
  } catch (e) {
    console.log(e)
  }
  $('#connect').innerHTML = 'Connected'
  console.log('Connected')
}

const registerVoter = async () => {
  if (!walletConnected()) return
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  const signer = provider.getSigner()
  const evoting = new ethers.Contract(contractAddress, abi, signer)

  const transactionResponse = await evoting.registerVoter()
  await listenForTransaction(transactionResponse, provider)
  console.log('Voter registered')

  // display options screen
  $('#home-screen').style = 'display: none'
  $('#option-screen').style = 'display: block'
  $('#vote-screen').style = 'display: none'
  $('#result-screen').style = 'display: none'
}

const displayVotingScreen = async () => {
  if (!walletConnected()) return
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  const signer = provider.getSigner()
  const evoting = new ethers.Contract(contractAddress, abi, signer)

  // generate voting screen
  const question = await evoting.question()
  const noOfCandidates = (await evoting.noOfCandidates()).toNumber()
  let candidatesHTML = ''
  for (let i = 0; i < noOfCandidates; ++i) {
    candidatesHTML += `<input type="radio" name="candidate" value="${i+1}"> ${await evoting.candidates(i)}<br>`
  }
  $('#vote-screen #question').innerHTML = question
  $('#vote-screen .candidates').innerHTML = candidatesHTML

  // display voting screen
  $('#home-screen').style = 'display: none'
  $('#option-screen').style = 'display: none'
  $('#vote-screen').style = 'display: block'
  $('#result-screen').style = 'display: none'
}

const castVote = async () => {
  if (!walletConnected()) return
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  const signer = provider.getSigner()
  const evoting = new ethers.Contract(contractAddress, abi, signer)

  // create vote string
  const noOfZeroBits = (await evoting.noOfZeroBits()).toNumber()
  const noOfRandomBits = (await evoting.noOfRandomBits()).toNumber()
  const selectedCandidate = BigInt($('input[name="candidate"]:checked').value)
  const vote = (selectedCandidate << BigInt(noOfZeroBits + noOfRandomBits)) + randomNumber(noOfRandomBits)
  const voteHash = new BN(ethers.utils.solidityKeccak256(['uint256'], [vote]).slice(2), 16)
  // prevent voter from changing page
  $('#vote-screen #submit').disabled = true
  $('#vote-screen .back').disabled = true

  const signature = await collectSignature(evoting, voteHash, await signer.getAddress())
  console.log('Verifying received signature...')
  const isSigValid = await evoting.verifySignature(voteHash.toArray(), signature)
  if (!isSigValid) {
    return alert('Invalid signature received')
  }
  console.log('Valid signature received')

  // cast vote
  console.log('Creating anonymous wallet...')
  const anonWallet = ethers.Wallet.createRandom().connect(provider)
  await signer.sendTransaction({ to: anonWallet.address, value: ethers.utils.parseEther("1") });
  console.log('Casting vote...')
  const transactionResponse = await evoting.connect(anonWallet).castVote(vote, signature)
  await listenForTransaction(transactionResponse, provider)
  console.log('Successfully casted vote')

  // revert settings to normal
  $('#vote-screen #submit').disabled = false
  $('#vote-screen .back').disabled = false

  // display result screen
  await displayResultScreen()
}

const displayOptionsScreen = async () => {
  // display home screen
  $('#home-screen').style = 'display: none'
  $('#option-screen').style = 'display: block'
  $('#vote-screen').style = 'display: none'
  $('#result-screen').style = 'display: none'
}

const displayResultScreen = async () => {
  if (!walletConnected()) return
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  const signer = provider.getSigner()
  const evoting = new ethers.Contract(contractAddress, abi, signer)

  // generate result screen
  const noOfCandidates = (await evoting.noOfCandidates()).toNumber()
  let candidatesHTML = '<ul>'
  for (let i = 0; i < noOfCandidates; ++i) {
    candidatesHTML += `<li>${await evoting.candidates(i)}: ${await evoting.voteCount(i+1)}</li>`
  }
  candidatesHTML += '</ul>'
  $('#result-screen .candidates').innerHTML = candidatesHTML

  // display result screen
  $('#home-screen').style = 'display: none'
  $('#option-screen').style = 'display: none'
  $('#vote-screen').style = 'display: none'
  $('#result-screen').style = 'display: block'
}

$('#connect').onclick = connectWallet
$('#register').onclick = registerVoter
$('#vote').onclick = displayVotingScreen
$('#submit').onclick = castVote
$('#vote-screen .back').onclick = displayOptionsScreen
$('#result-screen .back').onclick = displayOptionsScreen
$('#view-results').onclick = displayResultScreen
