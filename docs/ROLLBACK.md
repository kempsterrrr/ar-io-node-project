# Gateway Rollback Guide

## Overview

This document outlines strategies for rolling back the AR.IO gateway deployment to a previous version in case of issues.

## Current Deployment Behavior

- Deployment workflow: `.github/workflows/deploy-gateway.yml`
- Images use `:latest` tag by default (can be overridden with env vars)
- Each deployment pulls latest images from `ghcr.io/ar-io/`
- Automatic deployment on push to main branch

## Rollback Strategies

### 1. Manual SSH Rollback (Emergency)

**Speed:** 30 seconds | **Tracking:** None | **Best for:** Emergencies

SSH into the server and specify a previous image version:

```bash
ssh root@YOUR_SERVER
cd ~/ar-io-gateway

# View available local images
docker images | grep ar-io

# Rollback to specific version
export CORE_IMAGE_TAG=v1.2.3
export ENVOY_IMAGE_TAG=v1.2.3
docker compose up -d

# Verify
docker compose ps
curl http://localhost:4000/ar-io/info
```

**Pros:**
- Fastest rollback option
- Works when GitHub Actions is unavailable
- No git commit required
- Can test versions quickly

**Cons:**
- Changes not tracked in git
- Next automated deployment will overwrite
- No audit trail
- Requires direct SSH access

**When to use:** Gateway is down and needs immediate recovery.

---

### 2. Pin Versions in docker-compose.yaml (Recommended)

**Speed:** 5-10 min | **Tracking:** Full | **Best for:** Production stability

Update `apps/gateway/docker-compose.yaml` to pin specific versions:

```yaml
services:
  envoy:
    image: ghcr.io/ar-io/ar-io-envoy:v1.2.3  # Pin specific version

  core:
    image: ghcr.io/ar-io/ar-io-core:v1.2.3  # Pin specific version
```

Or use environment variables:

```yaml
services:
  envoy:
    image: ghcr.io/ar-io/ar-io-envoy:${ENVOY_IMAGE_TAG:-v1.2.3}

  core:
    image: ghcr.io/ar-io/ar-io-core:${CORE_IMAGE_TAG:-v1.2.3}
```

**Pros:**
- Version-controlled and auditable
- Prevents unexpected upgrades
- Reproducible deployments
- Clear visibility of what's running

**Cons:**
- Manual version updates required
- Requires commit + push + CI run
- More maintenance overhead
- Could miss security updates

**When to use:** As the default strategy for production environments.

---

### 3. Dedicated Rollback Workflow

**Speed:** 5-10 min | **Tracking:** Partial | **Best for:** Teams without SSH access

Create a new workflow file `.github/workflows/rollback-gateway.yml`:

```yaml
name: Rollback Gateway

on:
  workflow_dispatch:
    inputs:
      core_version:
        description: 'Core image version (e.g., v1.2.3 or latest)'
        required: true
        default: 'latest'
      envoy_version:
        description: 'Envoy image version (e.g., v1.2.3 or latest)'
        required: true
        default: 'latest'

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      # Similar to deploy-gateway.yml but with version inputs
      - name: Deploy specific version
        run: |
          ssh ${{ secrets.HETZNER_USER }}@${{ secrets.HETZNER_HOST }} << EOF
            cd ~/ar-io-gateway
            export CORE_IMAGE_TAG=${{ github.event.inputs.core_version }}
            export ENVOY_IMAGE_TAG=${{ github.event.inputs.envoy_version }}
            docker compose pull
            docker compose up -d
          EOF
```

**Pros:**
- Rollback via GitHub UI (no SSH needed)
- Tracked in GitHub Actions logs
- Specify versions without code changes
- Team-friendly access control

**Cons:**
- Requires workflow setup
- Doesn't prevent drift from git
- Manual rollback still needs SSH backup
- Versions not visible in codebase

**When to use:** Teams without direct server access who need audited rollbacks.

---

### 4. Git Revert

**Speed:** 5-10 min | **Tracking:** Full | **Best for:** Config-related issues

Revert the problematic commit:

```bash
# Find the bad commit
git log --oneline

# Revert it
git revert abc123
git push origin main
```

**Pros:**
- Reverts both config AND version changes
- Full git audit trail
- Standard git workflow
- Automatic CI/CD deployment

**Cons:**
- Only helps if issue was in YOUR changes
- Doesn't help with upstream gateway bugs
- Slower than direct SSH
- Creates additional commits

**When to use:** When you broke something in configuration, not when AR.IO released a bad version.

---

## Recommended Strategy: Hybrid Approach

### Production Setup (Recommended)

1. **Pin versions by default** in `docker-compose.yaml`
   - Prevents unexpected breaking changes
   - Makes rollbacks simple (just change version number)
   - Clear visibility of deployed version

2. **Keep SSH access as emergency escape hatch**
   - For critical outages requiring immediate action
   - Always document manual changes in git afterward

3. **Upgrade workflow:**
   - Test new versions manually on staging/dev first
   - Update pinned version in git when stable
   - Deploy via GitHub Actions
   - Monitor for 24-48 hours before next upgrade

### Current Setup Trade-offs

**Using `:latest` (current):**
- ✅ Automatic updates
- ❌ Unpredictable breaking changes
- ❌ Difficult to rollback (which was "latest" yesterday?)
- ❌ Not reproducible

**Using pinned versions:**
- ✅ Predictable and reproducible
- ✅ Easy rollback (just change version)
- ✅ Time to test before deploying
- ❌ Manual upgrade process

## Finding Available Versions

Check the AR.IO GitHub Container Registry for available tags:

- **Core versions:** https://github.com/ar-io/ar-io-node/pkgs/container/ar-io-core
- **Envoy versions:** https://github.com/ar-io/ar-io-node/pkgs/container/ar-io-envoy

Or via Docker CLI:

```bash
# List available tags (requires authentication)
docker search ghcr.io/ar-io/ar-io-core --list-tags
```

## Verification After Rollback

Always verify the rollback was successful:

```bash
# Check container status
docker compose ps

# Check running versions
docker images | grep ar-io

# Test gateway health
curl http://localhost:4000/ar-io/info

# Check logs for errors
docker compose logs --tail=100 core
docker compose logs --tail=100 envoy
```

## Monitoring and Alerts

Consider setting up monitoring to detect issues early:

1. Health check endpoint monitoring (`/ar-io/info`)
2. Error rate alerts from logs
3. Performance degradation detection
4. Version tracking in monitoring tools

## Example Rollback Scenario

**Situation:** New gateway version causes 500 errors

1. **Immediate action (SSH):**
   ```bash
   ssh root@SERVER
   cd ~/ar-io-gateway
   export CORE_IMAGE_TAG=v1.2.3  # Last known good version
   docker compose up -d
   ```

2. **Verify recovery:**
   ```bash
   curl http://localhost:4000/ar-io/info
   docker compose logs --tail=50
   ```

3. **Document in git:**
   ```bash
   # Update docker-compose.yaml to pin v1.2.3
   git commit -am "fix: rollback to gateway v1.2.3 due to 500 errors"
   git push origin main
   ```

4. **Post-mortem:**
   - Document what failed
   - Report to AR.IO team if it's an upstream bug
   - Test newer versions in staging before retry

## Related Documentation

- [Deployment Setup](../README.md)
- [SSL and Domain Configuration](SSL-DOMAIN.md)
- [Testing Guide](TESTING.md)
