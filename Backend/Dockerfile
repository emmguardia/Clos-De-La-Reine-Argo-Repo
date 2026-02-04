FROM node:20-alpine

WORKDIR /app

COPY dist/package*.json ./

RUN if [ -f package-lock.json ]; then npm ci --omit=dev 2>&1 | grep -v "npm notice" || true; else npm install --omit=dev 2>&1 | grep -v "npm notice" || true; fi

COPY dist/src/ ./src/

EXPOSE 3000

CMD ["node", "src/server.js"]

