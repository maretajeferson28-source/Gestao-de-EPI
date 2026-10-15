#!/bin/bash
# Prepara o volume do Railway e entrega para o entrypoint original da imagem.
set -euo pipefail

VOL=/var/lib/postgresql/data
mkdir -p "$VOL/custom"

# Primeiro boot: o volume vem vazio; copia a config custom que vem na imagem.
if [ -z "$(ls -A "$VOL/custom")" ]; then
  cp -a /etc/postgresql-custom.image/. "$VOL/custom/"
fi
chown -R postgres:postgres "$VOL/custom"

exec docker-entrypoint.sh "$@"
