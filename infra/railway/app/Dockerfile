# Site do Gestão de EPI: o repositório inteiro é o build context; o servidor
# Node não tem dependências (as do package.json são só da sincronização CAEPI).
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=8080
USER node
CMD ["node", "infra/railway/app/server.mjs"]
