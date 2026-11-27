#!/usr/bin/env bash
# One-time set-up of Complete on a fresh Hostinger VPS (Ubuntu 22.04/24.04, 4+ vCPU, 8+ GB RAM).
# Run as root:  bash setup.sh complete.pub
# Before running: point the domain's A record (and www) at this server's IP in Hostinger DNS.
set -euo pipefail
DOMAIN="${1:?Usage: bash setup.sh yourdomain}"
REPO_DIR=/opt/complete

echo "== Installing Docker and the firewall"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
apt-get update -qq && apt-get install -y -qq ufw git openssl >/dev/null
ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw --force enable >/dev/null

echo "== Getting the code"
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "The repository is private: create a GitHub deploy key or a fine-grained read-only token, then:"
  echo "  git clone https://<token>@github.com/brianodowd16-tech/northwestcomplete.git $REPO_DIR"
  echo "and run this script again."
  exit 1
fi
cd "$REPO_DIR" && git checkout -q prototype && git pull -q

echo "== Writing .env (secrets generated here, never leave the server)"
if [ ! -f .env ]; then
  cat > .env <<ENV
APP_URL=https://$DOMAIN
NODE_ENV=production
SESSION_SECRET=$(openssl rand -hex 32)
SECRETS_KEY=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -hex 24)
OPS_USER=ops
OPS_PASSWORD=$(openssl rand -hex 16)
# Fill these in, then: bash deploy/hostinger/update.sh
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:hello@$DOMAIN
ANTHROPIC_API_KEY=
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
ENV
  chmod 600 .env
fi
grep -q '^DOMAIN=' .env || echo "DOMAIN=$DOMAIN" >> .env

echo "== Daily database backups (kept 14 days in /var/backups/complete)"
mkdir -p /var/backups/complete
cat > /etc/cron.d/complete-backup <<CRON
30 3 * * * root docker exec complete-db-1 pg_dump -U round -Fc round > /var/backups/complete/round-\$(date +\%F).dump && find /var/backups/complete -name '*.dump' -mtime +14 -delete
CRON

echo "== Building and starting (first build takes a few minutes)"
cd deploy/hostinger && docker compose --env-file ../../.env up -d --build
echo
echo "Done. Open https://$DOMAIN (certificate may take a minute)."
echo "Operator console: https://$DOMAIN/ops  user: ops  password: $(grep ^OPS_PASSWORD ../../.env | cut -d= -f2)"
echo "Next: fill in SMTP/Twilio/VAPID/Anthropic/Xero in $REPO_DIR/.env, then: bash deploy/hostinger/update.sh"
