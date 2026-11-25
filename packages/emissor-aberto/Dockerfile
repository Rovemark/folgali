# Emissor aberto de agents de fora da folgali (revisão 0.6.0): um SERVIÇO separado do relé, com imagem, banco, chave e segredo próprios.
# Contexto de build: a raiz do repositório, só com packages/protocolo e packages/emissor-aberto. Construa com:
#   docker build -f packages/emissor-aberto/Dockerfile .
# - Sem dependência de npm: só o Node (node:sqlite).
# - Sem segredo na imagem: EMISSOR_CHAVE, EMISSOR_SEGREDO, EMISSOR_DONOS, EMISSOR_LINK e EMISSOR_RELE chegam por variável de ambiente.
# - Sem VOLUME declarado: quem sobe o contêiner monta um volume NOMEADO em /dados (banco) e outro em /backups.
# - O código é do root e só leitura; o processo só escreve em /dados e /backups.
FROM node:22-alpine
ENV NODE_ENV=production \
    NODE_OPTIONS="--disable-warning=ExperimentalWarning --max-old-space-size=192" \
    EMISSOR_BANCO=/dados/emissor-aberto.sqlite \
    EMISSOR_ENDERECO=0.0.0.0 \
    EMISSOR_PORTA=4848 \
    EMISSOR_BACKUP_PASTA=/backups
RUN addgroup -S -g 10002 emissor \
 && adduser -S -D -H -u 10002 -G emissor emissor \
 && mkdir -p /dados /backups \
 && chown emissor:emissor /dados /backups \
 && chmod 700 /dados /backups
WORKDIR /app
COPY packages/protocolo/package.json packages/protocolo/package.json
COPY packages/protocolo/src packages/protocolo/src
COPY packages/emissor-aberto/package.json packages/emissor-aberto/package.json
COPY packages/emissor-aberto/bin packages/emissor-aberto/bin
COPY packages/emissor-aberto/src packages/emissor-aberto/src
USER emissor
EXPOSE 4848
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:4848/saude || exit 1
CMD ["node", "packages/emissor-aberto/bin/emissor-aberto.js"]
