# =============================================================================
# Gitlawb Sidecar — operator UX
# =============================================================================
# Run `make help` to see available targets.
# =============================================================================

SHELL := /usr/bin/env bash

.DEFAULT_GOAL := help

.PHONY: help init up down restart logs ps shell stake status claim \
        unstake-request unstake upgrade build backup-did restore-did

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

init: ## First-run bootstrap: generate DID, write .env
	@./scripts/init.sh

up: ## Start the gitlawb-node + postgres stack
	@docker network inspect ar-io-network >/dev/null 2>&1 || { \
		echo "Error: docker network 'ar-io-network' not found."; \
		echo "       Bring up your AR.IO gateway first (it creates the network)."; \
		exit 1; \
	}
	@docker compose up -d gitlawb-postgres gitlawb-node
	@echo
	@echo "Stack starting. Watch logs with: make logs"

down: ## Stop the stack (preserves volumes)
	@docker compose down

restart: ## Restart gitlawb-node (e.g., after .env change)
	@docker compose restart gitlawb-node

logs: ## Tail gitlawb-node logs
	@docker compose logs -f gitlawb-node

ps: ## Show container status
	@docker compose ps

shell: ## Open a shell inside the running gitlawb-node container
	@docker compose exec gitlawb-node bash

backup-did: ## Export the node DID to ./backups/identity-<ts>.pem.bak — RUN THIS BEFORE STAKING
	@./scripts/backup-did.sh

restore-did: ## Restore the node DID from a backup file: make restore-did FILE=path
	@./scripts/restore-did.sh "${FILE}"

stake: ## Register on-chain with 10,000 $$GITLAWB (one-time)
	@./scripts/stake.sh

status: ## Print on-chain registration + heartbeat info
	@./scripts/status.sh

claim: ## Claim pending $$GITLAWB rewards
	@./scripts/claim.sh

unstake-request: ## Start the 7-day unstake cooldown
	@./scripts/unstake.sh request

unstake: ## Finalize unstake after >= 7 days
	@./scripts/unstake.sh finalize

upgrade: ## Pull the latest sidecar image and recreate the node
	@docker compose pull
	@docker compose up -d gitlawb-node

build: ## Build the sidecar image locally (for development)
	@docker compose build
