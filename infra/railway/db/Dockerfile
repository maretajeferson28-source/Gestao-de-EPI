# Banco do Gestão de EPI no Railway: a mesma imagem do Supabase self-hosted
# (docker/docker-compose.yml oficial), com dois ajustes para o Railway:
# dados numa subpasta do volume e TLS ligado para conexões externas.

# Certificado autoassinado: conexões de fora (TCP Proxy) usam sslmode=require.
FROM alpine:3.20 AS certs
RUN apk add --no-cache openssl \
 && openssl req -new -x509 -days 3650 -nodes -newkey rsa:2048 \
      -subj "/CN=gestao-epi-db" -keyout /server.key -out /server.crt

FROM supabase/postgres:17.6.1.136

COPY --from=certs /server.crt /server.key /etc/ssl/gestao-epi/
# Mesmos scripts e destinos que o compose oficial monta no container.
COPY init/realtime.sql /docker-entrypoint-initdb.d/migrations/99-realtime.sql
COPY init/webhooks.sql /docker-entrypoint-initdb.d/init-scripts/98-webhooks.sql
COPY init/roles.sql /docker-entrypoint-initdb.d/init-scripts/99-roles.sql
COPY init/jwt.sql /docker-entrypoint-initdb.d/init-scripts/99-jwt.sql
COPY railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh

# O Railway monta um volume só, em /var/lib/postgresql/data. A config custom
# (chave do pgsodium) passa a morar nele para sobreviver aos redeploys.
RUN sed -i 's/\r$//' /usr/local/bin/railway-entrypoint.sh \
      /docker-entrypoint-initdb.d/migrations/99-realtime.sql \
      /docker-entrypoint-initdb.d/init-scripts/98-webhooks.sql \
      /docker-entrypoint-initdb.d/init-scripts/99-roles.sql \
      /docker-entrypoint-initdb.d/init-scripts/99-jwt.sql \
 && chmod +x /usr/local/bin/railway-entrypoint.sh \
 && chown -R postgres:postgres /etc/ssl/gestao-epi \
 && chmod 600 /etc/ssl/gestao-epi/server.key \
 && if [ -d /etc/postgresql-custom ]; then mv /etc/postgresql-custom /etc/postgresql-custom.image; \
    else mkdir -p /etc/postgresql-custom.image; fi \
 && ln -s /var/lib/postgresql/data/custom /etc/postgresql-custom

# A raiz do volume tem lost+found: o Postgres não inicia direto nela.
ENV PGDATA=/var/lib/postgresql/data/pgdata

ENTRYPOINT ["railway-entrypoint.sh"]
CMD ["postgres", "-D", "/etc/postgresql", \
     "-c", "data_directory=/var/lib/postgresql/data/pgdata", \
     "-c", "ssl=on", \
     "-c", "ssl_cert_file=/etc/ssl/gestao-epi/server.crt", \
     "-c", "ssl_key_file=/etc/ssl/gestao-epi/server.key", \
     "-c", "log_min_messages=fatal"]
