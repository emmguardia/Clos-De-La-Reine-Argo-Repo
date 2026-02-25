# Stage 1: Build avec Node (overrides pour corriger les CVE)
FROM node:20-alpine AS builder

WORKDIR /app

# Overrides pour corriger minimatch, tar, etc.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --loglevel=error 2>&1 | grep -v "npm notice" || true

COPY . .

# Build de production
ENV VITE_API_URL=""
RUN npm run build

# Stage 2: Image finale nginx (aucun package Node = 0 vulnérabilité)
FROM nginx:alpine

# Fix CVE-2026-24515 (libexpat), CVE-2026-25646 (libpng) et autres mises à jour
RUN apk update && apk upgrade -a --no-cache && rm -rf /var/cache/apk/*

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
