#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATEWAY_ENV="${ROOT_DIR}/apps/gateway/.env"
LOCAL_COMPOSE="${ROOT_DIR}/docker-compose.local.yaml"
PROD_COMPOSE_GATEWAY="${ROOT_DIR}/apps/gateway/docker-compose.yaml"
PROD_COMPOSE_SIDECAR="${ROOT_DIR}/packages/trusthash-sidecar/docker-compose.sidecar.yaml"
SIDECAR_ENV_FILE_DEFAULT="${ROOT_DIR}/packages/trusthash-sidecar/.env.docker"
SIDECAR_DATA_DIR_DEFAULT="${ROOT_DIR}/packages/trusthash-sidecar/data"
SIDECAR_NGINX_CONF_DEFAULT="${ROOT_DIR}/packages/trusthash-sidecar/nginx.conf"

MODE="local"
COMPOSE_ARGS=()
for arg in "$@"; do
  if [[ "${arg}" == "--prod" ]]; then
    MODE="prod"
    continue
  fi
  COMPOSE_ARGS+=("${arg}")
done

if [[ ! -f "${GATEWAY_ENV}" ]]; then
  echo "Missing ${GATEWAY_ENV}."
  echo "Create it from apps/gateway/.env.example before running this script."
  exit 1
fi

if [[ "${MODE}" == "local" && ! -f "${LOCAL_COMPOSE}" ]]; then
  echo "Missing ${LOCAL_COMPOSE}."
  exit 1
fi

# Guard against user-defined compose env-file overrides.
if [[ "${MODE}" == "local" ]]; then
  env -u COMPOSE_ENV_FILE -u COMPOSE_ENV_FILES \
    docker compose \
    -f "${LOCAL_COMPOSE}" \
    up "${COMPOSE_ARGS[@]}"
else
  SIDECAR_ENV_FILE="${TRUSTHASH_SIDECAR_ENV_FILE:-${SIDECAR_ENV_FILE_DEFAULT}}"
  SIDECAR_DATA_DIR="${TRUSTHASH_SIDECAR_DATA_DIR:-${SIDECAR_DATA_DIR_DEFAULT}}"
  SIDECAR_NGINX_CONF="${TRUSTHASH_SIDECAR_NGINX_CONF:-${SIDECAR_NGINX_CONF_DEFAULT}}"
  env -u COMPOSE_ENV_FILE -u COMPOSE_ENV_FILES \
    TRUSTHASH_SIDECAR_ENV_FILE="${SIDECAR_ENV_FILE}" \
    TRUSTHASH_SIDECAR_DATA_DIR="${SIDECAR_DATA_DIR}" \
    TRUSTHASH_SIDECAR_NGINX_CONF="${SIDECAR_NGINX_CONF}" \
    docker compose \
    --env-file "${GATEWAY_ENV}" \
    -f "${PROD_COMPOSE_GATEWAY}" \
    -f "${PROD_COMPOSE_SIDECAR}" \
    up "${COMPOSE_ARGS[@]}"
fi
