// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DataToken is ERC721, Ownable {
    uint256 public nextId = 1;

    constructor() ERC721("BarcusData", "PODO") Ownable(msg.sender) {}

    function mintTo(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = nextId++;
        _mint(to, tokenId);
        return tokenId;
    }
}
