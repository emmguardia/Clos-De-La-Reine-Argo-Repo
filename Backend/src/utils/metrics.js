import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

// Registre Prometheus dédié (évite de polluer le registre global par défaut)
const register = new Registry();
register.setDefaultLabels({ app: 'clos-backend' });

// Métriques système Node.js : mémoire RSS/heap, event loop lag, GC, handles, etc.
collectDefaultMetrics({ register });

// ── Métriques HTTP ────────────────────────────────────────────────────────────

/**
 * Compteur total des requêtes HTTP.
 * Labels : method (GET/POST/…), route (/api/products, /api/orders, …), status_code (200/404/500/429)
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP reçues',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Histogramme de la durée des requêtes HTTP en secondes.
 * Permet de calculer p50/p90/p99 de latence dans Grafana.
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ── Métriques métier ──────────────────────────────────────────────────────────

/** Compteur des commandes créées. Labels : status (paid / failed / cancelled / created) */
export const ordersTotal = new Counter({
  name: 'orders_total',
  help: 'Nombre total de commandes créées',
  labelNames: ['status'],
  registers: [register],
});

/** Compteur des événements webhook Stripe reçus. */
export const webhookEventsTotal = new Counter({
  name: 'stripe_webhook_events_total',
  help: 'Nombre total d\'événements webhook Stripe traités',
  labelNames: ['event_type', 'result'],
  registers: [register],
});

/** Compteur des hits du rate-limiter (utile pour diagnostiquer les boucles côté client). */
export const rateLimitHitsTotal = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Nombre de requêtes rejetées par express-rate-limit',
  labelNames: ['limiter', 'route'],
  registers: [register],
});

/** Compteur des erreurs d'envoi d'email. */
export const emailErrorsTotal = new Counter({
  name: 'email_errors_total',
  help: 'Nombre total d\'erreurs d\'envoi d\'email',
  labelNames: ['template'],
  registers: [register],
});

export { register };
