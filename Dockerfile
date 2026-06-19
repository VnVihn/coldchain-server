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
COPY .env ./
COPY public ./public

# Create data directory for Excel files
RUN mkdir -p /app/data

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
