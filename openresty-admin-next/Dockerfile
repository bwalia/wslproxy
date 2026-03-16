FROM node:24.13.0-alpine

WORKDIR /app

# Install dependencies separately so Docker layer cache is reused when only
# source files change (not package.json / package-lock.json)
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Source is bind-mounted in docker-compose-local.yml for hot-reload.
# This COPY only runs during production builds (docker build without a mount).
COPY . .

EXPOSE 7619

# Default: development server with hot-reload
CMD ["npm", "run", "dev"]
