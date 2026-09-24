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

# On container start, if package.json on the bind-mount is newer than the
# last install, re-sync node_modules.  Needed because `node_modules` lives
# on a named Docker volume — adding a dep to package.json on the host
# wouldn't otherwise be reflected in the running container.
#
# `npm install` is a no-op when deps are already in sync, so this adds
# only ~1s on cold start when nothing has changed.
CMD ["sh", "-c", "npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline 2>&1 | tail -1 && npm run dev"]
