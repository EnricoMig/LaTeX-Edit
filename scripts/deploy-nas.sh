#!/usr/bin/env bash
# Deploy LaTeX Edit no NAS via SSH + Docker Compose
# Uso: ./scripts/deploy-nas.sh [user] [host] [remoteDir]
set -euo pipefail

USER_NAME="${1:-migliorini}"
HOST_IP="${2:-192.168.0.7}"
REMOTE_DIR="${3:-~/latexedit}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> Copiando projeto para ${USER_NAME}@${HOST_IP}:${REMOTE_DIR}"
ssh "${USER_NAME}@${HOST_IP}" "mkdir -p ${REMOTE_DIR}"
scp -r \
  "${PROJECT_ROOT}/Dockerfile" \
  "${PROJECT_ROOT}/docker-compose.yml" \
  "${PROJECT_ROOT}/docker-compose.casaos.yml" \
  "${PROJECT_ROOT}/.dockerignore" \
  "${PROJECT_ROOT}/pom.xml" \
  "${PROJECT_ROOT}/src" \
  "${USER_NAME}@${HOST_IP}:${REMOTE_DIR}/"

echo "==> Build + up no NAS (pode demorar)"
ssh -t "${USER_NAME}@${HOST_IP}" "cd ${REMOTE_DIR} && docker compose build && docker compose up -d && docker compose ps"

echo "==> Health"
curl -fsS -k "https://${HOST_IP}:8095/api/health" || curl -fsS "http://${HOST_IP}:8096/api/health" || true
echo
echo "App HTTPS: https://${HOST_IP}:8095/"
echo "CasaOS:    http://${HOST_IP}:90/"
