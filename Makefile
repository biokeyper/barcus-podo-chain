# Makefile
SHELL := /bin/bash

.PHONY: install devnet stop clean contracts-devnet deploy

install:
	@echo "Installing dependencies..."
	@cd chain && npm install
	@cd contracts && npm install

devnet:
	@echo "Starting devnet (chain nodes + local EVM + contracts)..."
	@docker compose -f docker/docker-compose.yml up -d --build
	@cd contracts && nohup npx hardhat node >/tmp/hardhat.log 2>&1 &
	@sleep 3
	@cd contracts && npx hardhat run scripts/deploy.ts --network localhost
	@echo "Devnet running. RPC: http://localhost:8545 (node1) | http://localhost:8546 (node2)"
	@echo "Hardhat JSON-RPC: http://127.0.0.1:8545"


stop:
	@echo "Stopping devnet..."
	@docker compose -f docker/docker-compose.yml down
	@pkill -f "hardhat node" || true

clean: stop
	@echo "Cleaning data volumes..."
	@docker volume rm podo-chain_node1 podo-chain_node2 || true
	@rm -rf chain/data/* || true

contracts-devnet:
	@cd contracts && npx hardhat node

deploy:
	@cd contracts && npx hardhat run scripts/deploy.ts --network localhost
