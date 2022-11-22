// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library ALT_BN128 {
  struct Point {
    uint256 x;
    uint256 y;
  }

  uint256 constant n = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001;
  uint256 constant Gx = 1;
  uint256 constant Gy = 2;

  function ecadd(Point memory P, Point memory Q) internal view returns (Point memory) {
    uint256[4] memory input;
    uint256[2] memory output;
    input[0] = P.x;
    input[1] = P.y;
    input[2] = Q.x;
    input[3] = Q.y;
    assembly {
      if iszero(staticcall(gas(), 0x06, input, 0x80, output, 0x40)) {
        revert(0, 0)
      }
    }
    return Point(
      output[0],
      output[1]
    );
  }

  function ecmul(Point memory P, uint256 k) internal view returns(Point memory) {
    uint256[3] memory input;
    uint256[2] memory output;
    input[0] = P.x;
    input[1] = P.y;
    input[2] = k;
    assembly {
      if iszero(staticcall(gas(), 0x07, input, 0x60, output, 0x40)) {
        revert(0, 0)
      }
    }
    return Point(
      output[0],
      output[1]
    );
  }
}
