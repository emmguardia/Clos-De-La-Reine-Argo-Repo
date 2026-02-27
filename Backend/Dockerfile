FROM node:20-alpine

ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=error
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# Mise à jour des paquets Alpine (correctifs sécurité)
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Patch sécurité: forcer tar@latest (corrige les CVE connues)
RUN npm install -g tar@latest \
    && NPM_TAR="/usr/local/lib/node_modules/npm/node_modules/tar" \
    && rm -rf "$NPM_TAR" \
    && mkdir -p "$(dirname "$NPM_TAR")" \
    && cp -r /usr/local/lib/node_modules/tar "$NPM_TAR" \
    && npm cache clean --force

# Patch sécurité: forcer minimatch@latest (corrige les CVE connues)
RUN npm install -g minimatch@latest \
    && NPM_MM="/usr/local/lib/node_modules/npm/node_modules/minimatch" \
    && rm -rf "$NPM_MM" \
    && mkdir -p "$(dirname "$NPM_MM")" \
    && cp -r /usr/local/lib/node_modules/minimatch "$NPM_MM" \
    && (find /usr/local/lib/node_modules -name "minimatch" -type d 2>/dev/null | while read d; do \
         [ "$d" = "/usr/local/lib/node_modules/minimatch" ] && continue; \
         rm -rf "$d" && cp -r /usr/local/lib/node_modules/minimatch "$d"; \
       done) \
    && npm cache clean --force

# Patch sécurité: forcer cross-spawn@latest et glob@latest (corrige les CVE connues)
RUN npm install -g cross-spawn@latest glob@latest \
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

# Re-patch minimatch après npm ci (remplace par la version latest)
RUN for d in $(find /usr/local/lib/node_modules /app/node_modules -name "minimatch" -type d 2>/dev/null); do \
      [ "$d" = "/usr/local/lib/node_modules/minimatch" ] && continue; \
      rm -rf "$d" && cp -r /usr/local/lib/node_modules/minimatch "$d"; \
    done

COPY dist/src/ ./src/

EXPOSE 3000

CMD ["node", "src/server.js"]
