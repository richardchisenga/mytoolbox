FROM node:20-bookworm-slim

WORKDIR /app

# Prisma requires OpenSSL
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# IMPORTANT:
# Copy Prisma schema before npm install because
# npm install runs the postinstall script.
COPY prisma ./prisma

# Install production dependencies and generate Prisma Client
RUN npm install --omit=dev --no-audit --no-fund

# Copy application source
COPY src ./src

# If your backend has other required files, copy them here
# COPY uploads ./uploads
# COPY public ./public

ENV NODE_ENV=production

EXPOSE 8080

USER node

CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
