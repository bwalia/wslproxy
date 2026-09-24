# Production Next.js standalone image for the k3s control-plane dashboard
# (cp.pop0.uk).  Dev/hot-reload continues to use Dockerfile.dev via compose.
#
# Build-args bake footer provenance (NEXT_PUBLIC_*).  Runtime WSLPROXY_API_URL
# points at the in-cluster OpenResty admin API so one image works per SHA.

# ── deps ──────────────────────────────────────────────────────────────────
FROM node:24.13.0-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# ── build ─────────────────────────────────────────────────────────────────
FROM node:24.13.0-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_APP_VERSION=dev
ARG NEXT_PUBLIC_APP_BUILD_NUMBER=local
ARG NEXT_PUBLIC_DEPLOYMENT_TIME=
ARG NEXT_PUBLIC_ENV_NAME=prod
ARG NEXT_PUBLIC_GIT_SHA=
ARG NEXT_PUBLIC_GIT_REPO=bwalia/wslproxy
ARG NEXT_PUBLIC_TARGET_PLATFORM=KUBERNETES
ARG NEXT_PUBLIC_APP_NAME=wslproxy
ARG NEXT_PUBLIC_APP_DISPLAY_NAME=WSL Proxy

ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION \
    NEXT_PUBLIC_APP_BUILD_NUMBER=$NEXT_PUBLIC_APP_BUILD_NUMBER \
    NEXT_PUBLIC_DEPLOYMENT_TIME=$NEXT_PUBLIC_DEPLOYMENT_TIME \
    NEXT_PUBLIC_ENV_NAME=$NEXT_PUBLIC_ENV_NAME \
    NEXT_PUBLIC_GIT_SHA=$NEXT_PUBLIC_GIT_SHA \
    NEXT_PUBLIC_GIT_REPO=$NEXT_PUBLIC_GIT_REPO \
    NEXT_PUBLIC_TARGET_PLATFORM=$NEXT_PUBLIC_TARGET_PLATFORM \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_DISPLAY_NAME=$NEXT_PUBLIC_APP_DISPLAY_NAME \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ── runner ────────────────────────────────────────────────────────────────
FROM node:24.13.0-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=7619 \
    HOSTNAME=0.0.0.0 \
    # Default in-cluster OpenResty admin API; override per deploy if needed.
    WSLPROXY_API_URL=http://wslproxy-ingress-openresty:8080 \
    WSLPROXY_ALLOWED_ORIGINS=cp.pop0.uk

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 7619

CMD ["node", "server.js"]
