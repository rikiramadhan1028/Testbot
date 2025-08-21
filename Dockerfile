# Dockerfile
FROM node:18-alpine

# Set environment variables
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn

# Install system dependencies for native modules
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    libc6-compat \
    && ln -sf python3 /usr/bin/python

# Create app directory
WORKDIR /app

# Create non-root user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files and change ownership
COPY --chown=nodejs:nodejs package*.json ./

# Install dependencies as root, then change ownership
RUN npm config set unsafe-perm true && \
    npm ci --only=production --no-optional --silent && \
    npm cache clean --force && \
    chown -R nodejs:nodejs /app/node_modules

# Copy source code
COPY --chown=nodejs:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node health-check.js || exit 1

# Start the bot
CMD ["npm", "start"]