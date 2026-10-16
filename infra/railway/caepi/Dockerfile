# Sincronização CAEPI dentro do Railway: roda uma vez a cada deploy e encerra.
# Valida por padrão (CAEPI_DRY_RUN=1); importar exige liberar as variáveis.
# Mesmo navegador do workflow do GitHub: o portal recusa headless, então o
# Chromium abre dentro do Xvfb, sem tela.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client xvfb \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY scripts/sync-caepi-to-supabase.mjs ./scripts/
COPY supabase/caepi-import.sql ./supabase/
COPY infra/railway/caepi/run.sh /usr/local/bin/caepi-run.sh
RUN sed -i 's/\r$//' /usr/local/bin/caepi-run.sh && chmod +x /usr/local/bin/caepi-run.sh
# Validação é o padrão da imagem: importar exige CAEPI_DRY_RUN=0 nas variáveis.
ENV CAEPI_DOWNLOAD_METHOD=browser CAEPI_DRY_RUN=1 TZ=America/Sao_Paulo
CMD ["/usr/local/bin/caepi-run.sh"]
