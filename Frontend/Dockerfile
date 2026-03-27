# Stage 1: Build avec Node (overrides pour corriger les CVE)
# Alpine ~5MB vs Debian ~1GB : surface d'attaque réduite
FROM node:25-alpine AS builder

WORKDIR /app

# package*.json : copie package.json + package-lock.json s’ils sont dans le contexte (sinon seul package.json)
COPY package*.json ./
RUN apk update && apk upgrade --no-cache \
    && if [ -f package-lock.json ]; then npm ci --no-audit --no-fund --loglevel=error; else npm install --no-audit --no-fund --loglevel=error; fi

COPY . .

# Build de production
ENV VITE_API_URL=""
RUN npm run build

# Stage 2: Image finale nginx (aucun package Node = 0 vulnérabilité)
# Alpine ~5MB vs Debian ~1GB : surface d'attaque réduite
FROM nginx:alpine

# Fix CVE-2026-24515 (libexpat), CVE-2026-25646 (libpng) et autres mises à jour
RUN apk update && apk upgrade -a --no-cache && rm -rf /var/cache/apk/*

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
