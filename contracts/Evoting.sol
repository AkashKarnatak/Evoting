// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import '@openzeppelin/contracts/access/Ownable.sol';
import { ALT_BN128 } from './utils/alt_bn128.sol';

error IncorrectNumberOfCandidates();
error InsufficientRandomBit();
error VoterNotRegistered();
error VoteSignatureMisMatch();
error VoteAlreadyCasted();
error InvalidVote();

contract Evoting is Ownable {

  struct Signature {
    ALT_BN128.Point R;
    uint256 s;
  }

  uint256 public immutable noOfCandidates;
  uint256 public immutable noOfVoteBits;
  uint256 public immutable noOfZeroBits;
  uint256 public immutable noOfRandomBits;
  string public question;
  string[] public candidates;
  ALT_BN128.Point public organiserPubKey;
  mapping (address => bool) public registeredVoters;
  mapping (uint256 => bool) public castedVotes;
  mapping (uint256 => uint256) public voteCount;

  event RequestPoint(address indexed from);
  event ReturnPoint(address indexed to, ALT_BN128.Point R_);
  event RequestSignProof(address indexed from, uint256 blindedVote);
  event ReturnSignProof(address indexed to, uint256 s_);

  constructor(
    uint256 _noOfCandidates,
    uint256 _noOfVoteBits,
    uint256 _noOfZeroBits,
    string memory _question,
    string[] memory _candidates,
    ALT_BN128.Point memory _organiserPubKey
  ) {
    noOfCandidates = _noOfCandidates;
    noOfVoteBits = _noOfVoteBits;
    noOfZeroBits = _noOfZeroBits;
    question = _question;
    candidates = _candidates;
    organiserPubKey = _organiserPubKey;
    // for security purpose we need atleast 128 random bits
    // to ensure high probability of unique votes
    if (noOfVoteBits + noOfZeroBits >= 128) {
      revert InsufficientRandomBit();
    }
    noOfRandomBits = 256 - (noOfVoteBits + noOfZeroBits);

    // TODO: add a check for vote bits
    // noOfVoteBits = floor(log2(noOfCandidates)) + 1
    if (candidates.length != noOfCandidates) {
      revert IncorrectNumberOfCandidates();
    }
  }

  modifier onlyRegisteredVoter() {
    if (!registeredVoters[msg.sender]) {
      revert VoterNotRegistered();
    }
    _;
  }

  // voters can register themselves
  function registerVoter() public {
    // TODO: handle alreadly registered voter
    registeredVoters[msg.sender] = true;
  }

  // organiser is allowed to remove registered voters
  function removeVoter(
    address voter
  ) onlyOwner public {
    registeredVoters[voter] = false;
  }

  // request a point decided by the organiser
  // to calculate blind signature
  function requestPoint() public onlyRegisteredVoter {
    emit RequestPoint(msg.sender);
  }

  // organiser return's the point to the
  // requester
  function returnPoint(
    address to,
    ALT_BN128.Point calldata R_
  ) public onlyOwner {
    emit ReturnPoint(to, R_);
  }

  // request signature proof from the
  // organiser on the blinded vote
  function requestSignProof(
    uint256 blindedVote
  ) public onlyRegisteredVoter {
    emit RequestSignProof(msg.sender, blindedVote);
  }

  // organiser returns the signature proof on
  // the blinded vote provided by the requester
  function returnSignProof(
    address to,
    uint256 s_
  ) public onlyOwner {
    emit ReturnSignProof(to, s_);
  }

  function verifySignature(
    bytes32 hashedVote,
    Signature calldata signedHashedVote
  ) public view returns (bool) {
    ALT_BN128.Point memory lhs = ALT_BN128.ecmul(
      ALT_BN128.Point(ALT_BN128.Gx, ALT_BN128.Gy),
      signedHashedVote.s
    );
    ALT_BN128.Point memory rhs = ALT_BN128.ecadd(
      signedHashedVote.R,
      ALT_BN128.ecmul(organiserPubKey, mulmod(signedHashedVote.R.x, uint256(hashedVote), ALT_BN128.n))
    );
    if (lhs.x == rhs.x && lhs.y == rhs.y) {
      return true;
    }
    return false;
  }

  // casting ballot
  function castVote(
    uint256 vote,
    Signature calldata signedHashedVote
  ) public onlyRegisteredVoter {
    if(!verifySignature(
      keccak256(abi.encodePacked(vote)),
      signedHashedVote
    )) { revert VoteSignatureMisMatch(); }
    // ensure correct position and number of zero bits
    if((((1 << noOfZeroBits) - 1) << noOfRandomBits) & vote != 0) {
      revert InvalidVote();
    }
    uint256 choice = vote >> (noOfZeroBits + noOfRandomBits);
    if (choice > noOfCandidates) {
      choice = 0;
    }
    if (castedVotes[vote]) {
      revert VoteAlreadyCasted();
    }
    castedVotes[vote] = true;
    ++voteCount[choice];
  }
}
