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

# On container start, re-sync node_modules from the (bind-mounted)
# package.json.  node_modules lives on a named volume, so a fresh dep
# added to package.json on the host wouldn't otherwise be reflected.
# yarn install is a no-op when deps are already in sync.
CMD ["sh", "-c", "yarn install --non-interactive --silent 2>&1 | tail -1 && yarn dev"]
