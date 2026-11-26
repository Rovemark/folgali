# folgali (site): Next build in standalone mode, ready for any container host.
# No secret in the image: the relay, the mode and the Rovemark login come from environment variables at run time.
# The login vault (sessions and encrypted tokens) lives in /app/.folgali-dados: mount a NAMED volume there
# (docker run -v folgali-dados:/app/.folgali-dados ...), otherwise every new image signs everyone out.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/.folgali-dados && chown app:app /app/.folgali-dados && chmod 700 /app/.folgali-dados
COPY --from=build /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/saude >/dev/null || exit 1
CMD ["node", "server.js"]
