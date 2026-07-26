#!/usr/bin/env bash
# Generates a self-signed TLS cert/key pair so productionServer.ts can also
# serve HTTPS (needed for the browser Notification API to work on a plain
# LAN IP — see server/productionServer.ts for why). Run once, and again
# whenever the Pi's LAN IP changes.
#
#   ./deploy/generate-cert.sh 192.168.86.86
#
# The browser will still show a "not secure" / self-signed warning the first
# time each device visits https://<that-ip>:3443 — click through it once
# (e.g. Chrome: Advanced -> Proceed). That's expected for a self-signed cert
# with no real CA behind it; it doesn't affect encryption, only the identity
# guarantee a real CA-issued cert would give.

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <pi-lan-ip-or-hostname>" >&2
  echo "Example: $0 192.168.86.86" >&2
  exit 1
fi

HOST="$1"
CERT_DIR="$(dirname "${BASH_SOURCE[0]}")/certs"
mkdir -p "$CERT_DIR"

# SAN entries need the right type tag — an IPv4 address has to be "IP:",
# anything else (a hostname like pi3b-1.local) has to be "DNS:" or openssl
# rejects the whole -addext outright with "bad ip address" (confirmed by
# testing) and generates no cert at all.
if [[ "$HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SAN="IP:$HOST,DNS:localhost"
else
  SAN="DNS:$HOST,DNS:localhost"
fi

openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -subj "/CN=$HOST" \
  -addext "subjectAltName=$SAN"

echo "Wrote $CERT_DIR/cert.pem and $CERT_DIR/key.pem for $HOST."
echo "Restart the service to pick it up: sudo systemctl restart planestatus"
