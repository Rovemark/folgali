# Relé da Rover Network (hospedagem). Contexto de build: a raiz do repositório rover-network, só com packages/protocolo e packages/rele
# (deploy/empacotar.sh monta esse pacote). Construa com: docker build -f packages/rele/Dockerfile .
#
# - Sem dependência de npm: o relé usa só o Node (node:sqlite). Por isso não há `npm install` nem node_modules.
# - Sem segredo na imagem: emissores, segredo das denúncias e token de administração chegam por variável de ambiente
#   em tempo de execução (por --env-file, sem gravar em disco; ver docs/OPERACAO-DO-RELE.md).
# - Sem VOLUME declarado de propósito: VOLUME sem volume nomeado vira volume anônimo novo a cada contêiner e o banco some a
#   cada deploy. Quem sobe o contêiner monta o volume nomeado em /dados (docs/OPERACAO-DO-RELE.md, seção 4).
# - O código é do root e só leitura para o usuário do processo; o processo só escreve em /dados (banco) e /backups.
FROM node:22-alpine
ENV NODE_ENV=production \
    NODE_OPTIONS="--disable-warning=ExperimentalWarning --max-old-space-size=256" \
    RELE_BANCO=/dados/rele.sqlite \
    RELE_ENDERECO=0.0.0.0 \
    RELE_PORTA=4747 \
    RELE_BACKUP_PASTA=/backups
RUN addgroup -S -g 10001 rele \
 && adduser -S -D -H -u 10001 -G rele rele \
 && mkdir -p /dados /backups \
 && chown rele:rele /dados /backups \
 && chmod 700 /dados /backups
WORKDIR /app
COPY packages/protocolo/package.json packages/protocolo/package.json
COPY packages/protocolo/src packages/protocolo/src
COPY packages/rele/package.json packages/rele/package.json
COPY packages/rele/bin packages/rele/bin
COPY packages/rele/src packages/rele/src
USER rele
EXPOSE 4747
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:4747/v1/info || exit 1
CMD ["node", "packages/rele/bin/rele-hospedado.js"]
