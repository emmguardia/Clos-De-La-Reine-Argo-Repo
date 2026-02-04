FROM node:20-alpine

ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=error
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# Mise à jour des paquets Alpine (correctifs sécurité)
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Corriger CVE-2026-24842, CVE-2026-23950, CVE-2026-23745 (tar): forcer 7.5.7 partout
RUN npm install -g tar@7.5.7 \
    && NPM_TAR="/usr/local/lib/node_modules/npm/node_modules/tar" \
    && rm -rf "$NPM_TAR" \
    && mkdir -p "$(dirname "$NPM_TAR")" \
    && cp -r /usr/local/lib/node_modules/tar "$NPM_TAR" \
    && npm cache clean --force

# Corriger CVE-2024-21538 (cross-spawn) et CVE-2025-64756 (glob)
RUN npm install -g cross-spawn@7.0.5 glob@10.5.0 \
    && G="/usr/local/lib/node_modules" \
    && for d in $(find "$G" -name "cross-spawn" -type d 2>/dev/null); do \
         [ "$d" = "$G/cross-spawn" ] && continue; \
         rm -rf "$d" && cp -r "$G/cross-spawn" "$d"; \
       done \
    && for d in $(find "$G" -name "glob" -type d 2>/dev/null); do \
         [ "$d" = "$G/glob" ] && continue; \
         rm -rf "$d" && cp -r "$G/glob" "$d"; \
       done \
    && npm cache clean --force

RUN echo "update-notifier=false" > .npmrc && echo "loglevel=error" >> .npmrc

COPY dist/package*.json ./

RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund --loglevel=error 2>&1 | grep -v "npm notice" || true; else npm install --omit=dev --no-audit --no-fund --loglevel=error 2>&1 | grep -v "npm notice" || true; fi \
    && npm cache clean --force 2>/dev/null || true

COPY dist/src/ ./src/

EXPOSE 3000

CMD ["node", "src/server.js"]
