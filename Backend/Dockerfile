# syntax=docker/dockerfile:1.7
#
# Build multi-stage : on installe les deps dans un stage build, on ne garde dans
# l'image finale que node + node_modules + le code.
#
# ── POURQUOI CE FICHIER A PERDU ~70 LIGNES DE PATCHS MANUELS
#
# La version précédente réinstallait « en latest » tar, minimatch, cross-spawn,
# glob, picomatch, undici (CVE-2026-12151) et sigstore (CVE-2026-48815), puis
# recopiait chaque version corrigée par-dessus TOUTES les copies imbriquées
# trouvées avec `find`, deux fois (avant et après le npm ci).
#
# Aucun de ces paquets ne vient de l'application : vérifié, ils sont absents de
# pnpm-lock.yaml et présents dans /usr/local/lib/node_modules/npm/node_modules.
# Ce sont les dépendances bundlées de npm lui-même.
#
# Or le runtime n'exécute que `node src/server.js`. npm, npx et corepack n'y
# servent à rien. En les supprimant de l'image finale, toutes leurs CVE
# disparaissent d'un coup — undici et sigstore compris. C'est une élimination
# structurelle et non un patch : rien à re-maintenir à la prochaine CVE, et
# plus de `cp -r` sur un chemin trouvé par `find` risquant d'écraser autre chose.

# ── Stage 1 : install des dépendances prod ───────────────────────────────────
FROM node:26-alpine AS deps

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

# Maj des paquets Alpine (correctifs sécurité système)
RUN apk update && apk upgrade --no-cache

# Chaîne de compilation pour les modules natifs : bcrypt ne publie pas toujours
# de binaire prébuild pour musl et retombe alors sur node-gyp. Ces paquets
# restent dans ce stage et n'atterrissent jamais dans l'image finale.
RUN apk add --no-cache python3 make g++

# Installe pnpm épinglé. On n'utilise pas corepack ici car il a été retiré du
# bundle Node à partir de Node 25/26.
RUN npm install -g pnpm@10.33.4 --no-audit --no-fund

WORKDIR /app

# Les manifestes viennent de dist/, produit par `pnpm build` (build.js) qui y
# recopie package.json, pnpm-lock.yaml et .npmrc.
# .npmrc porte ignore-scripts=true : seuls les paquets listés dans
# pnpm.onlyBuiltDependencies (ici bcrypt) ont le droit de builder.
COPY dist/package.json dist/pnpm-lock.yaml dist/.npmrc ./

RUN pnpm install --prod --frozen-lockfile \
    && pnpm store prune 2>/dev/null || true

# ── Stage 2 : image runtime minimale ─────────────────────────────────────────
FROM node:26-alpine AS runtime

ENV NODE_ENV=production

# Maj sécu Alpine
RUN apk update && apk upgrade --no-cache

# HARDENING SUPPLY-CHAIN : on retire npm, npx, corepack et leurs deps bundlées
# (tar, cross-spawn, glob, minimatch, picomatch, etc.) car le runtime n'en a pas
# besoin. C'est ce qui remplace les 50 lignes de patchs manuels d'avant.
RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /opt/yarn-* \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg \
    && rm -rf /root/.npm /root/.cache 2>/dev/null || true

WORKDIR /app

# L'utilisateur `node` (uid 1000) est fourni par l'image officielle.
# L'image précédente tournait en root : le port 3000 étant > 1024, rien
# n'imposait ce privilège.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node dist/package.json ./
COPY --chown=node:node dist/src/ ./src/

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
