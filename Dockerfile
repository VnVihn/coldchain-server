# Multi-stage build for Node.js
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Final stage - lightweight image
FROM node:18-alpine

WORKDIR /app

# Install sqlite3 system dependencies
RUN apk add --no-cache python3 make g++

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY package*.json ./
COPY server.js ./
COPY public ./public

# Create data directory for Excel files and telemetry
RUN mkdir -p /app/data

# Create default .env if not exists
RUN echo "PORT=3000\nNODE_ENV=production\nMQTT_BROKER=broker.emqx.io" > .env.example

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
