#!/usr/bin/env bash
# Pulls the latest PSPiDeployment code, rebuilds, and restarts the systemd
# service. Run from anywhere; it cd's to the repo root itself.
#
#   ./deploy/update-pi.sh
#
# Requires passwordless (or already-cached) sudo for `systemctl restart`,
# same as running that command by hand would.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "==> git pull"
git pull

echo "==> npm install"
npm install

echo "==> npm run build"
npm run build

echo "==> restarting planestatus service"
sudo systemctl restart planestatus

echo "==> done. Status:"
systemctl status planestatus --no-pager
