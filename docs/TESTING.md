# Testing Guide

This document describes how to test the AR.IO gateway and sidecars locally.

## Gateway Testing

### Quick Test

```bash
# 1. Start the gateway
cd apps/gateway
cp .env.example .env  # Only needed first time
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d

# 2. Wait for startup (10-15 seconds)
sleep 15

# 3. Check container status
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml ps

# 4. Run tests
./scripts/test-gateway.sh

# 5. Stop when done
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml down
```

### Manual Test Commands

```bash
# Gateway info endpoint
curl -s http://localhost:3000/ar-io/info | jq .

# Fetch test transaction (should return "test")
curl -sL http://localhost:3000/4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM

# Fetch another known transaction (returns book content)
curl -sL http://localhost:3000/3lyxgbgEvqNSvJrTX2J7CfRychUD5KClFhhVLyTPNCQ | head -c 100

# Check health
curl -s http://localhost:3000/ar-io/healthcheck
```

### Expected Results

| Endpoint                                       | Expected Response                      |
| ---------------------------------------------- | -------------------------------------- |
| `/ar-io/info`                                  | JSON with `processId`, `release`, etc. |
| `/4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM` | `test`                                 |
| `/ar-io/healthcheck`                           | `OK` or health status JSON             |

### Troubleshooting

```bash
# View all logs
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml logs

# View envoy logs only
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml logs envoy

# View core logs only
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml logs core

# Check if port 3000 is in use
lsof -i :3000

# Force remove containers and volumes
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml down -v
```

## Sidecar Testing

When you add sidecars to `packages/`, each should have its own test script. The pattern:

```bash
# Start the gateway first (sidecars depend on it)
cd apps/gateway
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d

# Start the sidecar
cd ../../packages/my-sidecar
docker compose up -d

# Run sidecar-specific tests
bun test

# Clean up
docker compose down
cd ../../apps/gateway
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml down
```

## CI Testing

The CI pipeline (`.github/workflows/ci.yml`) runs:

1. **Lint & Format** - Checks code style
2. **Validate Docker** - Ensures docker-compose files are valid
3. **Build Check** - Verifies the project builds

To run CI checks locally:

```bash
# From project root
bun run format:check
bun run build

# Validate docker-compose
cd apps/gateway
cp .env.example .env
docker compose config --quiet
```

## Integration Testing Checklist

Before deploying to production, verify:

- [ ] Gateway starts without errors
- [ ] `/ar-io/info` returns valid JSON
- [ ] Test transaction fetch works
- [ ] All sidecars connect to gateway network
- [ ] Observer reports (if enabled) are submitting
- [ ] ArNS subdomain routing works (if configured)

## Performance Testing

For load testing the gateway:

```bash
# Install hey (HTTP load generator)
brew install hey

# Run 1000 requests with 10 concurrent connections
hey -n 1000 -c 10 http://localhost:3000/ar-io/info

# Test data fetching under load
hey -n 100 -c 5 http://localhost:3000/4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM
```
