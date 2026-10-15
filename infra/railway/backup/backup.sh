#!/bin/sh
# Backup diário do Gestão de EPI para o Cloudflare R2, rodando como cron no
# Railway (rede privada: o banco não precisa ficar exposto). Banco e arquivos
# do storage saem criptografados com BACKUP_PASSPHRASE; sem ela não há restauração.
set -eu

: "${DATABASE_URL:?}" "${SERVICE_ROLE_KEY:?}" "${BACKUP_PASSPHRASE:?}" "${R2_BUCKET:?}"
STORAGE_URL="${STORAGE_URL:-http://storage.railway.internal:5000}"
KEEP_DAYS="${KEEP_DAYS:-90}"

stamp=$(date -u +%Y-%m-%d-%H%M)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

encrypt() {
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE
}

# Sem pipefail no sh: cada etapa grava em arquivo para um erro parar o script.
echo "[backup] banco"
pg_dump "$DATABASE_URL" -Fc -f "$work/banco.dump"
encrypt < "$work/banco.dump" > "$work/banco-$stamp.dump.enc"

echo "[backup] arquivos do storage"
mkdir -p "$work/storage"
psql "$DATABASE_URL" -X -A -t -F '|' -c "select bucket_id, name from storage.objects order by 1, 2" > "$work/objetos.txt"
while IFS='|' read -r bucket name; do
  [ -n "$name" ] || continue
  path=$(printf '%s' "$name" | jq -sRr 'split("/") | map(@uri) | join("/")')
  mkdir -p "$work/storage/$bucket/$(dirname "$name")"
  curl -fsS -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -o "$work/storage/$bucket/$name" "$STORAGE_URL/object/$bucket/$path"
done < "$work/objetos.txt"
tar -C "$work/storage" -czf "$work/arquivos.tar.gz" .
encrypt < "$work/arquivos.tar.gz" > "$work/arquivos-$stamp.tar.gz.enc"

echo "[backup] enviando para o R2"
rclone copyto "$work/banco-$stamp.dump.enc" "r2:$R2_BUCKET/banco/banco-$stamp.dump.enc"
rclone copyto "$work/arquivos-$stamp.tar.gz.enc" "r2:$R2_BUCKET/arquivos/arquivos-$stamp.tar.gz.enc"

echo "[backup] apagando cópias com mais de $KEEP_DAYS dias"
rclone delete "r2:$R2_BUCKET" --min-age "${KEEP_DAYS}d"

echo "[backup] ok $stamp: banco $(wc -c < "$work/banco-$stamp.dump.enc") bytes, arquivos $(wc -c < "$work/arquivos-$stamp.tar.gz.enc") bytes"
