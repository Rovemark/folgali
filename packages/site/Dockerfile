# folgali (site): build do Next em modo standalone, pronto para qualquer hospedagem de contêiner.
# Sem segredo na imagem: o relé, o modo e o login pela Rovemark vêm de variáveis de ambiente em tempo de execução.
# O cofre do login (sessões e fichas cifradas) mora em /app/.folgali-dados: monte um volume NOMEADO ali
# (docker run -v folgali-dados:/app/.folgali-dados ...), senão cada nova imagem desconecta todo mundo.
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
