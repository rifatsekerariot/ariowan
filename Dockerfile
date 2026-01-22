FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --production

# Copy source files
COPY src/ ./src/
COPY database/ ./database/
COPY scripts/ ./scripts/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app && \
    chmod +x scripts/health-check.sh

USER nodejs

EXPOSE 8090

# Health check: calls GET /health endpoint
# Returns 0 if db_connected=true and tables_ready=true
# Returns 1 if unhealthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD sh scripts/health-check.sh

CMD ["node", "src/app.js"]
