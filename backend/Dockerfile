# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Stage 2: Production
FROM node:20-slim AS production

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3002/api/health/live').then(r => { if (!r.ok) process.exit(1) })"

CMD ["node", "dist/index.js"]
