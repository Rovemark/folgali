#!/bin/sh
# Empacota SÓ o que a imagem do relé precisa (o mesmo conjunto que o Dockerfile copia). Sem testes, sem docs, sem scripts
# de demonstração, sem .git, sem banco, sem arquivo .env.
#   sh packages/rele/deploy/empacotar.sh <saida.tgz>
set -eu
[ $# -eq 1 ] || { echo "uso: sh empacotar.sh <saida.tgz>" >&2; exit 2; }
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
SAIDA="$1"
cd "$RAIZ"
for f in packages/rele/Dockerfile packages/rele/bin/rele-hospedado.js packages/protocolo/src/index.js; do
  [ -f "$f" ] || { echo "arquivo ausente no repositório: $f" >&2; exit 2; }
done
# COPYFILE_DISABLE evita que o tar do macOS leve atributos estendidos (arquivos ._*) para dentro do pacote.
COPYFILE_DISABLE=1 tar --exclude='*.sqlite*' --exclude=node_modules --exclude='*.log' --exclude='.env*' --exclude='segredo-*' \
  -czf "$SAIDA" \
  packages/protocolo/package.json packages/protocolo/src \
  packages/rele/package.json packages/rele/bin packages/rele/src packages/rele/Dockerfile
