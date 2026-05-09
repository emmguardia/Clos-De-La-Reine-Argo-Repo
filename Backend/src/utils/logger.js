import pino from 'pino';

// Logger structuré JSON (pino) — sortie parseable par Loki / Grafana / tout
// agrégateur de logs compatible avec les conteneurs K8s.
//
// En production : JSON sur stdout, un objet par ligne.
// En développement : format lisible via pino-pretty (si installé), sinon JSON.
const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  // Sérialise les erreurs proprement (stack trace inclus)
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  // Champs de base communs à chaque log
  base: {
    service: 'clos-backend',
    env: process.env.NODE_ENV || 'development',
  },
  // Timestamp ISO 8601 — compatible avec la plupart des parsers de logs
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev && {
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    },
  }),
});

export default logger;
