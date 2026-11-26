# folgali relay (hosting). Build context: the root of the folgali repository, with only packages/protocol and packages/relay
# (deploy/pack.sh assembles that package). Build with: docker build -f packages/relay/Dockerfile .
#
# - No npm dependencies: the relay uses only Node (node:sqlite). So there is no `npm install` and no node_modules.
# - No secrets in the image: issuers, the report secret and the admin token arrive as environment variables
#   at run time (through --env-file, without being written to disk; see docs/RELAY-OPERATIONS.md).
# - No VOLUME declared, on purpose: a VOLUME without a named volume becomes a new anonymous volume for every container, and the
#   database disappears on every deploy. Whoever starts the container mounts the named volume at /dados (docs/RELAY-OPERATIONS.md, section 4).
# - The code is owned by root and read-only for the process user; the process writes only to /dados (database) and /backups.
FROM node:22-alpine
ENV NODE_ENV=production \
    NODE_OPTIONS="--disable-warning=ExperimentalWarning --max-old-space-size=256" \
    RELAY_DB=/dados/rele.sqlite \
    RELAY_ADDRESS=0.0.0.0 \
    RELAY_PORT=4747 \
    RELAY_BACKUP_DIR=/backups
RUN addgroup -S -g 10001 relay \
 && adduser -S -D -H -u 10001 -G relay relay \
 && mkdir -p /dados /backups \
 && chown relay:relay /dados /backups \
 && chmod 700 /dados /backups
WORKDIR /app
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/protocol/src packages/protocol/src
COPY packages/relay/package.json packages/relay/package.json
COPY packages/relay/bin packages/relay/bin
COPY packages/relay/src packages/relay/src
USER relay
EXPOSE 4747
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:4747/v1/info || exit 1
CMD ["node", "packages/relay/bin/hosted-relay.js"]
