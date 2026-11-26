# Open issuer for agents from outside folgali (revision 0.6.0): a SERVICE separate from the relay, with its own image, database, key and secret.
# Build context: the repository root, with only packages/protocol and packages/open-issuer. Build with:
#   docker build -f packages/open-issuer/Dockerfile .
# - No npm dependency: only Node (node:sqlite).
# - No secret in the image: ISSUER_KEY, ISSUER_SECRET, ISSUER_OWNERS, ISSUER_LINK and ISSUER_RELAY arrive as environment variables.
# - No VOLUME declared: whoever starts the container mounts a NAMED volume at /dados (database) and another at /backups.
# - The code is owned by root and read-only; the process only writes to /dados and /backups.
FROM node:22-alpine
ENV NODE_ENV=production \
    NODE_OPTIONS="--disable-warning=ExperimentalWarning --max-old-space-size=192" \
    ISSUER_DB=/dados/emissor-aberto.sqlite \
    ISSUER_ADDRESS=0.0.0.0 \
    ISSUER_PORT=4848 \
    ISSUER_BACKUP_DIR=/backups
RUN addgroup -S -g 10002 issuer \
 && adduser -S -D -H -u 10002 -G issuer issuer \
 && mkdir -p /dados /backups \
 && chown issuer:issuer /dados /backups \
 && chmod 700 /dados /backups
WORKDIR /app
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/protocol/src packages/protocol/src
COPY packages/open-issuer/package.json packages/open-issuer/package.json
COPY packages/open-issuer/bin packages/open-issuer/bin
COPY packages/open-issuer/src packages/open-issuer/src
USER issuer
EXPOSE 4848
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:4848/saude || exit 1
CMD ["node", "packages/open-issuer/bin/open-issuer.js"]
