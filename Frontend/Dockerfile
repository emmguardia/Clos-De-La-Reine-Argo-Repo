# syntax=docker/dockerfile:1.7
#
# Build en deux temps : Vite compile dans un stage Node, l'image finale ne
# contient que nginx et les fichiers statiques — aucun paquet Node, donc aucune
# CVE npm dans le runtime.
#
# Contrairement à Zenix et Domaine où `dist/` est construit par la CI puis copié,
# ce repo compile à l'intérieur de l'image. On garde ce fonctionnement : il rend
# le build reproductible sans dépendre d'une étape CI préalable.

# ── Stage 1 : build Vite ─────────────────────────────────────────────────────
FROM node:26-alpine AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN apk update && apk upgrade --no-cache

# pnpm épinglé (corepack a été retiré du bundle Node à partir de Node 25/26)
RUN npm install -g pnpm@10.33.4 --no-audit --no-fund

WORKDIR /app

# Manifestes d'abord : la couche d'install reste en cache tant qu'ils ne
# changent pas. .npmrc porte minimum-release-age=1440 et ignore-scripts=true.
COPY package.json pnpm-lock.yaml .npmrc ./

# --frozen-lockfile : échoue si le lockfile ne correspond pas au package.json,
# au lieu de le régénérer en silence. L'ancien Dockerfile retombait sur
# `npm install` quand le lockfile manquait, ce qui rendait les builds
# non reproductibles.
RUN pnpm install --frozen-lockfile

COPY . .

ENV VITE_API_URL=""
RUN pnpm run build

# ── Stage 2 : image finale nginx ─────────────────────────────────────────────
FROM nginx:alpine

# Correctifs Alpine (libexpat, libpng, nghttp2, etc.)
RUN apk update && apk upgrade -a --no-cache && rm -rf /var/cache/apk/*

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# NOTE : ce conteneur tourne encore en root, contrairement au backend.
# nginx.conf écoute sur le port 80, et un process non privilégié ne peut pas
# binder un port < 1024. Passer en non-root suppose de basculer nginx.conf sur
# 8080 ET de mettre à jour containerPort / targetPort dans le chart Helm —
# une modification du déploiement, pas du pipeline. À traiter séparément.
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
