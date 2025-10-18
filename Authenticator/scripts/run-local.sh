#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_NAME="authenticator-node:local"
CONTAINER_NAME="authenticator-node"
PORT=${PORT:-3000}

echo "Checking port ${PORT}..."
if lsof -i :${PORT} -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "Port ${PORT} is in use. Attempting to stop local process..."
  PID=$(lsof -t -i :${PORT} -sTCP:LISTEN -n -P || true)
  if [ -n "$PID" ]; then
    kill "$PID" || true
    sleep 0.5
  fi
fi

mkdir -p "$ROOT_DIR/db" "$ROOT_DIR/logs"

echo "Building image ${IMAGE_NAME}..."
docker build -t ${IMAGE_NAME} -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "Running container ${CONTAINER_NAME}..."
docker rm -f ${CONTAINER_NAME} >/dev/null 2>&1 || true
docker run -d --name ${CONTAINER_NAME} -p ${PORT}:${PORT} \
  -v ${ROOT_DIR}/db:/usr/src/app/db \
  -v ${ROOT_DIR}/logs:/usr/src/app/logs \
  -e PORT=${PORT} ${IMAGE_NAME}

echo "Waiting for server readiness..."
for i in {1..30}; do
  if curl -sSf "http://localhost:${PORT}/" >/dev/null 2>&1; then
    echo "ready"
    break
  fi
  sleep 1
done

echo "Running smoke test..."
SKIP_START=true npm run smoke-test

echo "Cleaning up container..."
docker rm -f ${CONTAINER_NAME} >/dev/null 2>&1 || true

echo "Done. Logs are in ./logs/validation.log"
