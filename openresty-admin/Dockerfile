FROM node:24.13.0-alpine

WORKDIR /app

# Install dependencies separately so Docker layer cache is reused when only
# source files change (not package.json / yarn.lock)
COPY package.json yarn.lock ./
RUN yarn install

# Source is bind-mounted in docker-compose-local.yml for hot-reload.
# This COPY only runs during production builds (docker build without a mount).
COPY . .

EXPOSE 5173

# Development server — Vite proxies /api and /health to wslproxy (no CORS)
CMD ["yarn", "dev"]
