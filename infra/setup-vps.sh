#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 VPS for the public overlay +
# coordinator (B-P5a). Run as root from a clone of the repo:
#   sudo bash infra/setup-vps.sh
# Then: edit /etc/agentcoop.env (hosts, e-mail), `systemctl restart agentcoop caddy`.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/agentcoop
DATA_DIR=/var/lib/agentcoop
BACKUP_DIR=/var/backups/agentcoop

# Node 22 (NodeSource) and Caddy (official apt repo)
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

id agentcoop >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin agentcoop
install -d -o agentcoop -g agentcoop -m 700 "$DATA_DIR" "$BACKUP_DIR"
install -d -o caddy -g caddy /var/log/caddy

# Code: copy the clone (without data or secrets) and install dependencies
rsync -a --delete --exclude node_modules --exclude data --exclude .env --exclude backups "$REPO_DIR/" "$APP_DIR/"
chown -R agentcoop:agentcoop "$APP_DIR"
sudo -u agentcoop bash -c "cd $APP_DIR && npx -y npm@11 ci"

# Env (once; never overwritten)
if [ ! -f /etc/agentcoop.env ]; then
  install -m 600 -o root -g root "$APP_DIR/infra/agentcoop.env.example" /etc/agentcoop.env
  echo ">>> edit /etc/agentcoop.env (OVERLAY_HOST, COOP_HOST, ACME_EMAIL)"
fi

# Caddy reads the same hosts
install -m 644 "$APP_DIR/infra/Caddyfile" /etc/caddy/Caddyfile
mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/agentcoop.env\n' > /etc/systemd/system/caddy.service.d/agentcoop.conf

install -m 644 "$APP_DIR/infra/agentcoop.service" /etc/systemd/system/agentcoop.service
systemctl daemon-reload
systemctl enable --now agentcoop
systemctl restart caddy

# Daily backup at 03:17
echo "17 3 * * * agentcoop cd $APP_DIR && DATA_DIR=$DATA_DIR BACKUP_DIR=$BACKUP_DIR /usr/bin/node infra/backup.mjs >> $BACKUP_DIR/backup.log 2>&1" > /etc/cron.d/agentcoop-backup

# Only SSH and HTTP(S) from outside; 8080/8090 stay on loopback behind Caddy
if command -v ufw >/dev/null; then
  ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
fi

echo "done: systemctl status agentcoop caddy; journalctl -u agentcoop -f"
