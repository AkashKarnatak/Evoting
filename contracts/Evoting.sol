// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import '@openzeppelin/contracts/access/Ownable.sol';

contract Evoting is Ownable {

  struct Signature {
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  mapping (address => bool) public registeredVoters;
  mapping (uint256 => bool) public castedVotes;
  mapping (uint256 => uint256) public voteCount;
  uint256 public noOfCandidates;
  uint256 public noOfVoteBits;
  uint256 public noOfZeroBits;
  uint256 public noOfRandomBits;

  event RequestSignature(uint256 blindedVote);

  constructor(uint256 _noOfCandidates, uint256 _noOfVoteBits, uint256 _noOfZeroBits) {
    noOfCandidates = _noOfCandidates;
    noOfVoteBits = _noOfVoteBits;
    noOfZeroBits = _noOfZeroBits;
    // for security purpose we need atleast 128 random bits
    // to ensure high probability of unique votes
    require(
      noOfVoteBits + noOfZeroBits < 128,
      "Sum of vote bits and zero bit cannot be more than 128"
    );
    noOfRandomBits = 256 - (noOfVoteBits + noOfZeroBits);
  }

  // voters can register themselves
  function registerVoter() public {
    // TODO: handle alreadly registered voter
    registeredVoters[msg.sender] = true;
  }

  // organiser is allowed to remove registered voters
  function removeVoter(address voter) onlyOwner public {
    registeredVoters[voter] = false;
  }

  // collect organiser's signature
  function requestSignature(uint256 blindedVote) public {
    emit RequestSignature(blindedVote);
  }

  function verifySignature(bytes32 hashedVote, Signature memory signedHashedVote) public view returns (bool) {
    bytes32 hashedPrefixedVote = keccak256(
      abi.encodePacked(
        "\x19Ethereum Signed Message:\n32",
        hashedVote
    ));
    address signer = ecrecover(hashedPrefixedVote, signedHashedVote.v, signedHashedVote.r, signedHashedVote.s);
    return (signer == owner());
  }

  // casting ballot
  function castVote(uint256 vote, Signature memory signedHashedVote) public {
    require(verifySignature(
      keccak256(abi.encodePacked(vote)),
      signedHashedVote
    ), "Vote and it's signature does not match");
    // ensure correct position and number of zero bits
    require(
      (((1 << noOfZeroBits) - 1) << noOfRandomBits) & vote == 0,
      "Invalid vote string"
    );
    uint256 choice = vote >> (noOfZeroBits + noOfRandomBits);
    if (choice > noOfCandidates) {
      choice = 0;
    }
    require(!castedVotes[vote], "Vote has been already casted");
    castedVotes[vote] = true;
    ++voteCount[choice];
  }

}
