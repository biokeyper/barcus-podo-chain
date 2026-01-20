// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDataToken {
    function mintTo(address to) external returns (uint256);
}

contract DataRegistry {
    struct Dataset {
        address owner;
        bytes32 commitmentRoot;
        uint256 sizeGiB;
        uint256 collateral;
        bool minted;
    }

    mapping(bytes32 => Dataset) public datasets;
    IDataToken public dataToken;

    event Registered(bytes32 indexed datasetId, address indexed owner, bytes32 root, uint256 sizeGiB, uint256 collateral);
    event Minted(bytes32 indexed datasetId, uint256 tokenId);

    constructor(address dataTokenAddr) {
        dataToken = IDataToken(dataTokenAddr);
    }

    function register(bytes32 datasetId, bytes32 commitmentRoot, uint256 sizeGiB) external payable {
        require(datasets[datasetId].owner == address(0), "exists");
        require(msg.value > 0, "collateral required");
        datasets[datasetId] = Dataset(msg.sender, commitmentRoot, sizeGiB, msg.value, false);
        emit Registered(datasetId, msg.sender, commitmentRoot, sizeGiB, msg.value);
    }

    function mint(bytes32 datasetId) external {
        Dataset storage d = datasets[datasetId];
        require(d.owner == msg.sender, "not owner");
        require(!d.minted, "already minted");
        d.minted = true;
        uint256 tokenId = dataToken.mintTo(msg.sender);
        emit Minted(datasetId, tokenId);
    }
}
