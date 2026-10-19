FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
RUN mkdir -p storage/invoices storage/uploads/avatars && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
