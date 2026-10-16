#!/bin/sh
# Aponta o script para o Chromium que vem na imagem do Playwright e o roda numa
# tela virtual. O xvfb-run trava como processo principal de container, então
# o Xvfb é aberto aqui diretamente.
set -eu
CAEPI_BROWSER_PATH=$(find /ms-playwright -path '*chrome-linux*/chrome' -type f | head -n 1)
[ -n "$CAEPI_BROWSER_PATH" ] || { echo '[CAEPI] Chromium não encontrado na imagem'; exit 1; }
export CAEPI_BROWSER_PATH
echo "[CAEPI] modo: $([ "${CAEPI_DRY_RUN:-1}" = 1 ] && echo validação || echo importação)"

Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp >/dev/null 2>&1 &
xvfb_pid=$!
trap 'kill "$xvfb_pid" 2>/dev/null || true' EXIT
export DISPLAY=:99
sleep 2

node scripts/sync-caepi-to-supabase.mjs
