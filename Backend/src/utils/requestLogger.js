import pinoHttp from 'pino-http';
import logger from './logger.js';
import { httpRequestsTotal, httpRequestDuration } from './metrics.js';

// Normalise les routes dynamiques pour éviter la "cardinality explosion" dans Prometheus.
// ex: /api/products/42  →  /api/products/:id
//     /api/orders/507f1f77bcf86cd799439011  →  /api/orders/:id
function normalizeRoute(url) {
  return url
    .split('?')[0]
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[a-f0-9]{24}/g, '/:id') // ObjectIDs Mongo
    .replace(/\/$/, '') || '/';
}

// Middleware pino-http : logue chaque requête HTTP en JSON structuré.
// En production ce log est capturé par le runtime de conteneur (Docker / K8s).
export const httpLogger = pinoHttp({
  logger,
  // Ne pas loguer les health-checks pour éviter le bruit (sondes K8s toutes les 10 s)
  autoLogging: {
    ignore: (req) => req.url === '/api/health' || req.url === '/api/metrics',
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} — ${err?.message || 'error'}`,
  // Niveaux de log selon le code HTTP — 429 et 4xx en warn, 5xx en error
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    responseTime: 'durationMs',
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

// Middleware Prometheus : enregistre chaque requête dans les compteurs/histogrammes.
export const prometheusMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;
    const route = normalizeRoute(req.originalUrl || req.url);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSec);
  });

  next();
};
