# Cron de backup: pg_dump 17 (mesma versão do banco), rclone para o R2.
FROM postgres:17-alpine
RUN apk add --no-cache rclone openssl curl jq
COPY backup.sh /usr/local/bin/backup.sh
RUN sed -i 's/\r$//' /usr/local/bin/backup.sh && chmod +x /usr/local/bin/backup.sh
# O rclone lê o destino "r2" destas variáveis; as chaves vêm do Railway.
ENV RCLONE_CONFIG_R2_TYPE=s3 \
    RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
ENTRYPOINT []
CMD ["/usr/local/bin/backup.sh"]
