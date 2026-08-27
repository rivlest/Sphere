#!/usr/bin/env bash
# Reset this machine to the public Sphere chain (GitHub master).
# Wipes local chain data. Keeps wallets/seed.json if present.
# Optional always-on helper (REST + P2P). Not required for the network.
# Does not mine — operators mine on their own machines.
# Run on the seed VPS as the same user that owns ~/Sphere.
set -euo pipefail

SEED_P2P_URL="${SEED_P2P_URL:-ws://57.128.203.234:6001}"
REPO_URL="${REPO_URL:-https://github.com/rivlest/Sphere.git}"
APP_DIR="${APP_DIR:-$HOME/Sphere}"
DATA_DIR="${DATA_DIR:-$HOME/sphere-data}"
WALLET="${WALLET:-$APP_DIR/wallets/seed.json}"

echo "[sphere] stopping old node…"
pkill -f "src/cli/node.ts" 2>/dev/null || true
pkill -f "tsx src/cli/node.ts" 2>/dev/null || true
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl stop sphere 2>/dev/null || true
fi
sleep 2

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "[sphere] cloning $REPO_URL → $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "[sphere] updating to origin/master…"
git -C "$APP_DIR" fetch origin
git -C "$APP_DIR" checkout master
git -C "$APP_DIR" pull --ff-only origin master

echo "[sphere] npm install…"
cd "$APP_DIR"
npm install

mkdir -p "$(dirname "$WALLET")"

echo "[sphere] wiping chain data (old SHA-256d / account snapshots cannot join this network)…"
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"
rm -rf "$APP_DIR/data"

if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 22/tcp
  sudo ufw allow 3001/tcp
  sudo ufw allow 6001/tcp
  sudo ufw allow 6002/tcp
  sudo ufw --force enable || true
fi

NPM_BIN="$(command -v npm)"
NODE_BIN="$(command -v node)"
SERVICE=/etc/systemd/system/sphere.service
echo "[sphere] installing $SERVICE"
sudo tee "$SERVICE" >/dev/null <<UNIT
[Unit]
Description=Sphere public seed node (no mining)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
Group=$(id -gn)
WorkingDirectory=$APP_DIR
ExecStart=$NPM_BIN run start -- --port 3001 --p2p-port 6001 --data-dir $DATA_DIR --p2p-url $SEED_P2P_URL
Restart=always
RestartSec=4
Environment=NODE_ENV=production
Environment=PATH=$(dirname "$NODE_BIN"):/usr/bin:/bin

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable sphere
sudo systemctl restart sphere

echo "[sphere] waiting for REST…"
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:3001/status >/tmp/sphere-status.json 2>/dev/null; then
    cat /tmp/sphere-status.json
    echo
    echo "[sphere] public seed is on GitHub master (not mining). Dial $SEED_P2P_URL; mine on your own machine with --mine."
    exit 0
  fi
  sleep 2
done

echo "[sphere] node did not answer on :3001 — last log:" >&2
sudo journalctl -u sphere -n 80 --no-pager >&2
exit 1
