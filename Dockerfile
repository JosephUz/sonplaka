# Son Plaka: tek süreç, tek port (statik dosyalar + WebSocket odaları). Derleme adımı yok.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Bağımlılıklar önce: kaynak değişince bu katman önbellekten gelir.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server.mjs game.js index.html style.css ./
COPY src ./src
COPY server ./server

ENV HOST=0.0.0.0 PORT=5187
EXPOSE 5187
USER node

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5187/health >/dev/null || exit 1

CMD ["node", "server.mjs"]
