FROM node:20-alpine

LABEL org.opencontainers.image.source="https://github.com/bwalia/wslproxy"
LABEL org.opencontainers.image.description="WSLProxy Cache Test Origin Server"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --only=production; fi

# Copy application files
COPY server.js ./
COPY static ./static/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

USER nodejs

EXPOSE 3000

ENV PORT=3000

CMD ["node", "server.js"]
