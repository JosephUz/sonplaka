# Son Plaka: tek süreç, tek port (statik dosyalar + WebSocket odaları). Derleme adımı yok.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Bağımlılıklar önce: kaynak değişince bu katman önbellekten gelir.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# Güvenlik: Alpine yamaları; çalışırken gerekmeyen npm/npx/corepack/yarn imajdan çıkar (açıkları çoğunlukla onlarda)
RUN apk upgrade --no-cache && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY server.mjs game.js index.html style.css ./
COPY src ./src
COPY server ./server

ENV HOST=0.0.0.0 PORT=5187
EXPOSE 5187
USER node

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5187/health >/dev/null || exit 1

CMD ["node", "server.mjs"]
