#!/usr/bin/env bash
# Deploy the latest code (or new .env values): pull, rebuild, migrate once, restart replicas one by one.
set -euo pipefail
cd /opt/complete && git pull -q
cd deploy/hostinger && docker compose --env-file ../../.env up -d --build
docker image prune -f >/dev/null
echo "Updated. Health: $(curl -s https://$(grep ^DOMAIN= ../../.env | cut -d= -f2)/api/health?deep=1)"
