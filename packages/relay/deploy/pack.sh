#!/bin/sh
# Packs ONLY what the relay image needs (the same set the Dockerfile copies). No tests, no docs, no demo scripts,
# no .git, no database, no .env file.
#   sh packages/relay/deploy/pack.sh <saida.tgz>
set -eu
[ $# -eq 1 ] || { echo "uso: sh pack.sh <saida.tgz>" >&2; exit 2; }
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
SAIDA="$1"
cd "$RAIZ"
for f in packages/relay/Dockerfile packages/relay/bin/hosted-relay.js packages/protocol/src/index.js; do
  [ -f "$f" ] || { echo "arquivo ausente no repositório: $f" >&2; exit 2; }
done
# COPYFILE_DISABLE stops the macOS tar from putting extended attributes (._* files) into the package.
COPYFILE_DISABLE=1 tar --exclude='*.sqlite*' --exclude=node_modules --exclude='*.log' --exclude='.env*' --exclude='segredo-*' \
  -czf "$SAIDA" \
  packages/protocol/package.json packages/protocol/src \
  packages/relay/package.json packages/relay/bin packages/relay/src packages/relay/Dockerfile
