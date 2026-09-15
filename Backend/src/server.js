import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { sendNewContactNotificationEmail, sendContactConfirmationEmail, sendOrderConfirmationEmail, sendNewOrderNotificationEmail, sendOrderValidatedEmail } from './utils/email.js';
import { sendInvoiceEmail } from './utils/invoice.js';
import Stripe from 'stripe';
import logger from './utils/logger.js';
import { register as metricsRegister, rateLimitHitsTotal } from './utils/metrics.js';
import { httpLogger, prometheusMiddleware } from './utils/requestLogger.js';
import {
  createPool, ensureSchema, closePool,
  query, queryOne, transaction,
  parseJson, toJson, toBool, toNum, escapeLike, placeholders,
} from './config/database.js';

logger.info({ version: process.version, env: process.env.NODE_ENV || 'development' }, '[BOOT] Démarrage du serveur');

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[CRASH] uncaughtException');
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ err: reason, promise: String(promise) }, '[CRASH] unhandledRejection');
  process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-only-secret-changez-moi');
if (!JWT_SECRET) {
  console.error('[BOOT] FATAL: JWT_SECRET manquant en production. Arrêt du serveur.');
  process.exit(1);
}
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
const stripe = STRIPE_SECRET_KEY && STRIPE_SECRET_KEY.startsWith('sk_')
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })
  : null;

app.set('trust proxy', 1);

// ── Observabilité ──────────────────────────────────────────────────────────────
// AVANT tous les autres middlewares (en particulier express-rate-limit),
// pour que MÊME les requêtes 429 soient loguées et comptées.
app.use(prometheusMiddleware); // compteurs Prometheus
app.use(httpLogger);           // logs JSON structurés pino-http

app.use(compression());
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Helmet — security headers (supprime X-Powered-By, ajoute HSTS, CSP, etc.)
// crossOriginEmbedderPolicy désactivé : le frontend appelle ce backend via CORS
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
// Permissions-Policy non couvert par helmet par défaut
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// ---------------------------------------------------------------------------
// CORS — origines explicites depuis FRONTEND_URL (env), localhost en dev
// ---------------------------------------------------------------------------
const corsAllowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(s => s.trim()).filter(Boolean)
  : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsAllowedOrigins.includes(origin)) return callback(null, origin);
    callback(new Error('CORS not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// ---------------------------------------------------------------------------
// Anti-CSRF — vérifie Origin/Referer sur les méthodes mutantes (POST/PUT/PATCH/DELETE)
// Plus simple que csurf (deprecated) : pas de token à propager côté front, et
// efficace contre CSRF puisque les navigateurs envoient toujours Origin sur ces
// méthodes. Combiné avec sameSite=lax sur les cookies, couvre les vecteurs CSRF.
// ---------------------------------------------------------------------------
const CSRF_MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use((req, res, next) => {
  if (!CSRF_MUTATING_METHODS.has(req.method)) return next();
  // Stripe webhooks : auth via signature, pas de CSRF possible (pas de cookie utilisé)
  if (req.path === '/api/stripe/webhook') return next();

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // Pas d'Origin ni Referer : possiblement server-to-server. On laisse passer si pas
  // de cookie d'auth, sinon on rejette (un browser doit avoir au moins l'un des deux).
  if (!origin && !referer) {
    if (req.cookies?.authToken || req.cookies?.adminAuthToken) {
      return res.status(403).json({ error: 'Origin/Referer manquant' });
    }
    return next();
  }

  // Extrait l'origine source (priorité à Origin, fallback Referer)
  let sourceHost = null;
  let sourceOrigin = null;
  try {
    if (origin) {
      sourceOrigin = origin;
      sourceHost = new URL(origin).host;
    } else if (referer) {
      const u = new URL(referer);
      sourceOrigin = u.origin;
      sourceHost = u.host;
    }
  } catch { /* malformed */ }

  // Cas 1 — Same-origin : host source == host requête (via X-Forwarded-Host derrière proxy).
  // Pas de CSRF possible : une attaque cross-site aurait un host différent.
  const requestHost = req.headers['x-forwarded-host'] || req.headers.host;
  if (sourceHost && requestHost && sourceHost === requestHost) return next();

  // Cas 2 — Cross-origin : doit être dans la whitelist CORS
  if (sourceOrigin && corsAllowedOrigins.includes(sourceOrigin)) return next();

  req.log?.warn({ origin, referer, requestHost, sourceHost, ip: req.ip, route: req.originalUrl }, '[CSRF] Origin/Referer rejeté');
  return res.status(403).json({ error: 'Origin non autorisée' });
});

// ---------------------------------------------------------------------------
// Body parsing — limite générale 1 Mo ; routes portant des images base64
// (upload, produits, galerie) tolèrent 25 Mo (≈ 3 images de 5 Mo)
// ---------------------------------------------------------------------------
const LARGE_BODY_PATHS = ['/api/images/upload', '/api/products', '/api/gallery'];
app.use((req, res, next) => {
  const isLargeBody = LARGE_BODY_PATHS.some((p) => req.path === p || req.path.startsWith(p + '/'));
  express.json({ limit: isLargeBody ? '25mb' : '1mb', strict: true })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 100 }));

// Anti-bruteforce des routes d'authentification non authentifiées (login,
// inscription). Monté UNIQUEMENT en middleware de route : un app.use('/api/auth')
// en plus ferait compter deux fois chaque login, et ferait consommer le quota
// par les simples lectures de profil.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de tentatives, veuillez réessayer plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes de compte qui revérifient le mot de passe (changement de mot de passe,
// suppression de compte). Compteur distinct d'authLimiter : modifier son profil
// ne doit pas épuiser le quota de connexion.
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de requêtes. Veuillez réessayer dans quelques minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de messages envoyés. Veuillez réessayer dans quelques minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    await logAdminAttempt(clientIp, false, { reason: 'Rate limit dépassé', userAgent });
    res.status(429).json({ error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.' });
  }
});

const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de requêtes. Veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const sitemapLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Trop de requêtes sitemap' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Trop de requêtes. Veuillez réessayer dans une minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    // Important : on logue + compte chaque hit pour pouvoir diagnostiquer les
    // boucles de fetch côté front (ex. /api/products?ids=2 spammé en boucle).
    rateLimitHitsTotal.inc({ limiter: 'api', route: req.baseUrl + req.path });
    req.log?.warn({
      limiter: 'api',
      ip: req.ip,
      route: req.originalUrl,
      method: req.method,
      ua: req.headers['user-agent'],
    }, '[RATE-LIMIT] /api dépassé (120 req/min)');
    res.status(options.statusCode).json(options.message);
  },
});

// ── Endpoints d'observabilité ─────────────────────────────────────────────────
// Déclarés AVANT apiLimiter pour ne pas être rate-limités (sondes K8s toutes les 10 s)
// et AVANT le middleware "DB-required" pour rester dispos quand la DB est down.
app.get('/api/health', async (_req, res) => {
  if (!dbReady) return res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// Endpoint de scrape Prometheus — protégé par token Bearer si METRICS_TOKEN défini.
app.get('/api/metrics', async (req, res) => {
  const metricsToken = process.env.METRICS_TOKEN;
  if (metricsToken) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${metricsToken}`) {
      return res.status(401).end('Unauthorized');
    }
  }
  try {
    res.set('Content-Type', metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

app.use('/api', apiLimiter);

const SALT_ROUNDS = 12;
const ADMIN_JWT_EXPIRATION = '8h';

// dbReady remplace la variable `db` du client Mongo : les routes /api sont
// refusées en 503 tant que le pool n'a pas répondu au moins une fois.
let dbReady = false;

async function connectToDatabase() {
  try {
    createPool();
    await query('SELECT 1');
    await ensureSchema();
    dbReady = true;
    logger.info({
      host: process.env.MARIADB_HOST || 'localhost',
      database: process.env.MARIADB_DATABASE || 'clos_de_la_reine',
    }, '✅ Connecté à MariaDB');
    startSecurityRowsPurge();
  } catch (error) {
    dbReady = false;
    logger.error({ err: error }, '❌ Erreur de connexion MariaDB');
    setTimeout(connectToDatabase, 5000);
  }
}

// Remplace les index TTL de Mongo (expireAfterSeconds) : MariaDB n'a pas
// d'expiration de ligne, et l'event scheduler n'est pas garanti actif sur le
// serveur partagé — la purge est donc portée par l'application.
let purgeTimer = null;
function startSecurityRowsPurge() {
  if (purgeTimer) return;
  const purge = async () => {
    try {
      await query('DELETE FROM admin_login_attempts WHERE timestamp < NOW(3) - INTERVAL 24 HOUR');
      await query('DELETE FROM ip_bans WHERE expires_at < NOW(3)');
    } catch (err) {
      logger.warn({ err }, '[PURGE] Nettoyage des tables de sécurité impossible');
    }
  };
  purge();
  purgeTimer = setInterval(purge, 60 * 60 * 1000);
  purgeTimer.unref();
}

// ---------------------------------------------------------------------------
// Mappers SQL → JSON de l'API
//
// Le contrat du frontend est inchangé depuis MongoDB : mêmes noms de champs en
// camelCase, mêmes valeurs par défaut. Ces fonctions sont le seul endroit où la
// convention snake_case des colonnes est traduite.
// ---------------------------------------------------------------------------

function defaultSizes(category) {
  if (category === 'laisses') return ['1m', '1m20'];
  if (category === 'colliers' || category === 'harnais') return ['XS', 'S', 'M', 'L', 'XL'];
  return [];
}

function mapProduct(row, { minimal = false } = {}) {
  const sizes = parseJson(row.sizes, []);
  const base = {
    id: row.id,
    name: row.name,
    price: toNum(row.price),
    image: row.image,
    category: row.category,
    collection: row.collection,
    color: parseJson(row.color, []),
    sizes: sizes.length ? sizes : defaultSizes(row.category),
    surcharge1m20: toNum(row.surcharge_1m20),
    surchargeSurMesure: toNum(row.surcharge_sur_mesure),
    isNew: toBool(row.is_new),
    briefDescription: row.brief_description || undefined,
    disponible: toBool(row.disponible),
  };
  if (minimal) return base;
  return {
    ...base,
    secondImage: row.second_image,
    additionalImages: parseJson(row.additional_images, []),
  };
}

/** Produit complet (GET /api/products/:id et retour d'admin) — inclut les dates. */
function mapProductFull(row) {
  return {
    ...mapProduct(row),
    briefDescription: row.brief_description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapShippingAddress(row) {
  return {
    firstName: row.ship_first_name,
    lastName: row.ship_last_name,
    email: row.ship_email,
    phone: row.ship_phone,
    address: row.ship_address,
    city: row.ship_city,
    postalCode: row.ship_postal_code,
    country: row.ship_country,
  };
}

function mapDogInfo(row) {
  return {
    breed: row.dog_breed,
    age: row.dog_age,
    tourDeCou: row.dog_tour_de_cou,
    tourDeTaille: row.dog_tour_de_taille,
    surMesureCollier: toBool(row.dog_sur_mesure_collier),
    surMesureHarnais: toBool(row.dog_sur_mesure_harnais),
  };
}

function mapOrderItem(row) {
  return {
    productId: row.product_id,
    quantity: row.quantity,
    price: toNum(row.price),
    size: row.size ?? null,
  };
}

function mapOrder(row, items) {
  return {
    id: row.id,
    orderNumber: row.order_number || null,
    userId: row.user_id,
    items,
    shippingAddress: mapShippingAddress(row),
    dogInfo: mapDogInfo(row),
    notes: row.notes || '',
    total: toNum(row.total),
    originalTotal: toNum(row.original_total),
    promoCode: parseJson(row.promo_code, null),
    shippingAmount: toNum(row.shipping_amount),
    feesAmount: toNum(row.fees_amount),
    status: row.status,
    counterProposal: parseJson(row.counter_proposal, null),
    paymentInfo: parseJson(row.payment_info, null),
    rejectionReason: row.rejection_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Charge une commande et ses lignes. */
async function findOrderById(orderId) {
  const row = await queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!row) return null;
  const items = await query(
    'SELECT product_id, quantity, price, size FROM order_items WHERE order_id = ? ORDER BY position, id',
    [orderId]
  );
  return mapOrder(row, items.map(mapOrderItem));
}

/** Remplace toutes les lignes d'une commande (acceptation d'une contre-proposition). */
async function replaceOrderItems(conn, orderId, items) {
  await conn.query('DELETE FROM order_items WHERE order_id = ?', [orderId]);
  let position = 0;
  for (const item of items || []) {
    await conn.query(
      'INSERT INTO order_items (order_id, product_id, quantity, price, size, position) VALUES (?, ?, ?, ?, ?, ?)',
      [orderId, item.productId, item.quantity, item.price, item.size ?? null, position++]
    );
  }
}

function mapPromoCode(row) {
  return {
    id: row.id,
    name: row.name || null,
    code: row.code,
    discountType: row.discount_type,
    discountValue: toNum(row.discount_value),
    maxUses: row.max_uses,
    currentUses: row.current_uses || 0,
    isActive: toBool(row.is_active),
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getProductMapByIds(productIds) {
  if (!productIds || productIds.length === 0) return {};
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const products = await query(
    `SELECT id, name, \`collection\`, category FROM products WHERE id IN (${placeholders(ids.length)})`,
    ids
  );
  return Object.fromEntries(products.map(p => [p.id, p]));
}

function validateEmail(email) {
  if (typeof email !== 'string' || email.length > 254) return false;
  const atIdx = email.indexOf('@');
  if (atIdx <= 0 || atIdx === email.length - 1) return false;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (!local.length || !domain.includes('.')) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);
}

function validatePassword(password) {
  return password && password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
}

function getAuthCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',   // Lax : protège contre CSRF tout en laissant passer les liens entrants
    maxAge,
    path: '/',
  };
}

function getAdminCookieOptions() {
  // 8h = durée de session admin (ADMIN_JWT_EXPIRATION)
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  };
}

function authenticateToken(req, res, next) {
  const token = req.cookies?.authToken;

  if (!token) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      res.clearCookie('authToken', { path: '/' });
      return res.status(403).json({ error: 'Session invalide ou expirée' });
    }
    req.user = user;
    next();
  });
}

async function authenticateAdmin(req, res, next) {
  // Priorité : cookie httpOnly (sécurisé) > header Authorization (rétrocompat)
  const token = req.cookies?.adminAuthToken
    || (req.headers['authorization']?.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Accès admin requis' });
    }

    const adminAuth = await queryOne('SELECT id FROM admin_auth LIMIT 1');
    if (!adminAuth) {
      return res.status(403).json({ error: 'Configuration admin introuvable' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré' });
    }
    return res.status(403).json({ error: 'Token invalide' });
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Sitemap XML dynamique — inclut les pages statiques + dernière modif produit
// Nginx proxifie /sitemap.xml vers ce backend (cf. configmap nginx)
// ---------------------------------------------------------------------------
app.get('/sitemap.xml', sitemapLimiter, async (req, res) => {
  try {
    const BASE_URL = 'https://leclosdelareine.com';
    const today = new Date().toISOString().split('T')[0];
    let productsLastMod = today;

    if (dbReady) {
      try {
        const latest = await queryOne(
          'SELECT updated_at, created_at FROM products ORDER BY updated_at DESC, created_at DESC LIMIT 1'
        );
        if (latest) {
          const d = latest.updated_at || latest.created_at;
          if (d) productsLastMod = new Date(d).toISOString().split('T')[0];
        }
      } catch (_) { /* si la table est vide, on garde today */ }
    }

    const pages = [
      { url: '/',                           priority: '1.0', changefreq: 'weekly',  lastmod: today },
      { url: '/boutique',                   priority: '0.9', changefreq: 'daily',   lastmod: productsLastMod },
      { url: '/boutique?category=colliers', priority: '0.8', changefreq: 'daily',   lastmod: productsLastMod },
      { url: '/boutique?category=harnais',  priority: '0.8', changefreq: 'daily',   lastmod: productsLastMod },
      { url: '/boutique?category=laisses',  priority: '0.8', changefreq: 'daily',   lastmod: productsLastMod },
      { url: '/galerie',                    priority: '0.7', changefreq: 'monthly', lastmod: today },
      { url: '/faq',                        priority: '0.7', changefreq: 'monthly', lastmod: today },
      { url: '/contact',                    priority: '0.6', changefreq: 'yearly',  lastmod: today },
      { url: '/cgv',                        priority: '0.3', changefreq: 'yearly',  lastmod: today },
      { url: '/mentions-legales',           priority: '0.3', changefreq: 'yearly',  lastmod: today },
      { url: '/politique-confidentialite',  priority: '0.3', changefreq: 'yearly',  lastmod: today },
    ];

    const urlEntries = pages.map(({ url, priority, changefreq, lastmod }) =>
      `  <url>\n    <loc>${BASE_URL}${url}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
    ).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('[SITEMAP] Erreur génération:', err?.message || err);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ stripePublishableKey: STRIPE_PUBLISHABLE_KEY || '' });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/config') return next();
  if (!dbReady) return res.status(503).json({ error: 'Service temporairement indisponible' });
  next();
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'closdelareine@gmail.com';
const SUBJECT_LABELS = {
  commande: 'Question sur une commande',
  produit: 'Question sur un produit',
  retour: 'Retour / Échange',
  partenariat: 'Partenariat',
  autre: 'Autre'
};

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Nom, email et message sont requis' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Format email invalide' });
    }
    const contactData = {
      from_name: String(name).trim().slice(0, 200),
      email: email.toLowerCase().trim(),
      subject: SUBJECT_LABELS[subject] || subject || 'Contact',
      message: String(message).trim().slice(0, 2000)
    };
    const adminResult = await sendNewContactNotificationEmail(ADMIN_EMAIL, contactData);
    if (!adminResult.success) {
      console.error('Contact email to admin failed:', adminResult.error);
      return res.status(500).json({ error: 'Erreur lors de l\'envoi du message. Réessayez plus tard.' });
    }
    sendContactConfirmationEmail(contactData.email, { from_name: contactData.from_name }).catch((err) => {
      console.error('Contact confirmation email failed (non-blocking):', err.message);
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur contact:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Format email invalide' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ 
        error: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre' 
      });
    }

    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      return res.status(400).json({ error: 'Le prénom et le nom doivent contenir au moins 2 caractères' });
    }

    const existingUser = await queryOne('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existingUser) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = {
      id: randomUUID(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    };

    try {
      await query(
        'INSERT INTO users (id, email, password, first_name, last_name, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [user.id, user.email, user.password, user.firstName, user.lastName]
      );
    } catch (err) {
      // Course entre deux inscriptions simultanées : la contrainte UNIQUE tranche.
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Cet email est déjà utilisé' });
      }
      throw err;
    }

    // JWT payload : seulement userId, pas d'email (PII en clair) — l'email est récupéré
    // depuis la DB via authenticateToken si nécessaire. CodeQL: clear-text-storage.
    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('authToken', token, getAuthCookieOptions(7 * 24 * 60 * 60 * 1000));

    res.status(201).json({
      message: 'Inscription réussie',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    if (email.length > 255 || password.length > 128) {
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      return res.status(400).json({ error: 'Données invalides' });
    }

    const emailLower = email.toLowerCase().trim();
    if (!validateEmail(emailLower)) {
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      return res.status(400).json({ error: 'Format email invalide' });
    }

    const startTime = Date.now();
    const user = await queryOne('SELECT * FROM users WHERE email = ?', [emailLower]);
    const elapsedTime = Date.now() - startTime;

    if (!user) {
      const delay = Math.max(1500 - elapsedTime, 500) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    if (!toBool(user.is_active)) {
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    const passwordStartTime = Date.now();
    const passwordMatch = await bcrypt.compare(password, user.password);
    const passwordElapsedTime = Date.now() - passwordStartTime;

    if (!passwordMatch) {
      const delay = Math.max(2000 - passwordElapsedTime, 500) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    await query('UPDATE users SET last_login = NOW(3) WHERE id = ?', [user.id]);

    const tokenExpiration = rememberMe === true ? '30d' : '1d';
    const cookieMaxAge = rememberMe === true ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    // JWT payload : seulement userId, pas d'email — éviter PII en clair dans le token.
    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: tokenExpiration }
    );

    res.cookie('authToken', token, getAuthCookieOptions(cookieMaxAge));

    res.json({
      message: 'Connexion réussie',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id, email, first_name, last_name, created_at, last_login FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      createdAt: user.created_at,
      lastLogin: user.last_login
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('authToken', { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax' });
  res.json({ message: 'Déconnexion réussie' });
});

app.put('/api/auth/me', accountLimiter, authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, email, currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    const user = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const updates = [];
    const values = [];
    const errors = [];

    if (firstName && firstName.trim().length >= 2) {
      updates.push('first_name = ?');
      values.push(firstName.trim());
    } else if (firstName) {
      errors.push('Le prénom doit contenir au moins 2 caractères');
    }

    if (lastName && lastName.trim().length >= 2) {
      updates.push('last_name = ?');
      values.push(lastName.trim());
    } else if (lastName) {
      errors.push('Le nom doit contenir au moins 2 caractères');
    }

    if (email && validateEmail(email)) {
      const emailLower = email.toLowerCase().trim();
      if (emailLower !== user.email) {
        const existingUser = await queryOne('SELECT id FROM users WHERE email = ? AND id <> ?', [emailLower, userId]);
        if (existingUser) {
          errors.push('Cet email est déjà utilisé');
        } else {
          updates.push('email = ?');
          values.push(emailLower);
        }
      }
    } else if (email) {
      errors.push('Format email invalide');
    }

    if (newPassword) {
      if (!currentPassword) {
        errors.push('Le mot de passe actuel est requis pour changer le mot de passe');
      } else {
        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
          errors.push('Mot de passe actuel incorrect');
        } else if (!validatePassword(newPassword)) {
          errors.push('Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre');
        } else {
          updates.push('password = ?');
          values.push(await bcrypt.hash(newPassword, SALT_ROUNDS));
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune modification à apporter' });
    }

    updates.push('updated_at = NOW(3)');
    values.push(userId);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    const updatedUser = await queryOne(
      'SELECT id, email, first_name, last_name, created_at, last_login FROM users WHERE id = ?',
      [userId]
    );

    res.json({
      message: 'Profil mis à jour avec succès',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        createdAt: updatedUser.created_at,
        lastLogin: updatedUser.last_login
      }
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/auth/export', authenticateToken, async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.userId]);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const exportData = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isActive: toBool(user.is_active),
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_login,
      exportedAt: new Date().toISOString()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="mes-donnees-${Date.now()}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Erreur lors de l\'export des données:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/auth/me', accountLimiter, authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Mot de passe requis pour supprimer le compte' });
    }

    const user = await queryOne('SELECT id, password FROM users WHERE id = ?', [req.user.userId]);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // Panier et favoris tombent avec le compte (ON DELETE CASCADE). Les
    // commandes sont volontairement conservées : obligation comptable de 10 ans.
    await query('DELETE FROM users WHERE id = ?', [req.user.userId]);

    res.json({ message: 'Compte supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du compte:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const minimal = req.query.minimal !== '0' && (req.query.minimal === '1' || req.query.minimal === 'true' || !req.query.minimal);
    const idsParam = req.query.ids;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 24));
    const skip = idsParam ? 0 : (page - 1) * limit;
    const ALLOWED_CATEGORIES = ['colliers', 'harnais', 'laisses'];
    const categoryRaw = req.query.category;
    const category = (typeof categoryRaw === 'string' && ALLOWED_CATEGORIES.includes(categoryRaw)) ? categoryRaw : null;
    const collectionRaw = req.query.collection;
    const collection = typeof collectionRaw === 'string' ? collectionRaw.slice(0, 100) : null;
    const colorRaw = req.query.color;
    const color = typeof colorRaw === 'string' ? colorRaw.slice(0, 50) : null;
    const isNew = req.query.isNew === '1' || req.query.isNew === 'true';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const includeFilters = req.query.includeFilters === '1' || req.query.includeFilters === 'true';

    const where = [];
    const params = [];
    if (idsParam && typeof idsParam === 'string') {
      const ids = idsParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (ids.length > 0) {
        where.push(`id IN (${placeholders(ids.length)})`);
        params.push(...ids);
      }
    } else {
      if (category) { where.push('category = ?'); params.push(category); }
      if (collection) { where.push('`collection` = ?'); params.push(collection); }
      // color est un tableau JSON : JSON_CONTAINS remplace le $or scalaire/$in de Mongo.
      if (color) { where.push('JSON_CONTAINS(color, JSON_QUOTE(?))'); params.push(color); }
      if (isNew) { where.push('is_new = 1'); }
      if (search) {
        const like = `%${escapeLike(search)}%`;
        where.push("(name LIKE ? ESCAPE '\\\\' OR `collection` LIKE ? ESCAPE '\\\\')");
        params.push(like, like);
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Les colonnes image sont des LONGTEXT base64 : en mode minimal on ne
    // remonte pas secondImage / additionalImages (allègement de la réponse).
    const columns = minimal
      ? 'id, name, price, image, category, `collection`, color, sizes, surcharge_1m20, surcharge_sur_mesure, is_new, brief_description, disponible'
      : '*';

    const [products, totalRows, metaProducts] = await Promise.all([
      query(
        `SELECT ${columns} FROM products ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`,
        [...params, idsParam ? 500 : limit, skip]
      ),
      idsParam ? Promise.resolve(null) : query(`SELECT COUNT(*) AS total FROM products ${whereSql}`, params),
      (includeFilters && page === 1 && !idsParam)
        ? query(
            `SELECT \`collection\`, color FROM products ${category ? 'WHERE category = ?' : ''}`,
            category ? [category] : []
          )
        : Promise.resolve(null)
    ]);

    const total = totalRows ? Number(totalRows[0].total) : 0;
    const formattedProducts = products.map(p => mapProduct(p, { minimal }));

    if (idsParam) {
      res.json(formattedProducts);
    } else {
      const payload = { products: formattedProducts, total };
      if (metaProducts) {
        payload.collections = [...new Set(metaProducts.map(p => p.collection).filter(Boolean))].sort();
        payload.colors = [...new Set(metaProducts.flatMap(p => parseJson(p.color, [])).filter(Boolean))].sort();
      }
      res.json(payload);
    }
  } catch (error) {
    console.error('Erreur lors de la récupération des produits:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/products/filters', async (req, res) => {
  try {
    const ALLOWED_CATEGORIES = ['colliers', 'harnais', 'laisses'];
    const categoryRaw = req.query.category;
    const category = (typeof categoryRaw === 'string' && ALLOWED_CATEGORIES.includes(categoryRaw)) ? categoryRaw : null;
    const products = await query(
      `SELECT \`collection\`, color FROM products ${category ? 'WHERE category = ?' : ''}`,
      category ? [category] : []
    );
    const collections = [...new Set(products.map(p => p.collection).filter(Boolean))].sort();
    const colors = [...new Set(products.flatMap(p => parseJson(p.color, [])).filter(Boolean))].sort();
    res.json({ collections, colors });
  } catch (error) {
    console.error('Erreur lors de la récupération des filtres:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/products/ids', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=300');
    const products = await query('SELECT id FROM products ORDER BY id ASC');
    res.json({ ids: products.map(p => p.id) });
  } catch (error) {
    console.error('Erreur lors de la récupération des IDs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await queryOne('SELECT * FROM products WHERE id = ?', [parseInt(req.params.id, 10)]);
    if (!product) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    res.json(mapProductFull(product));
  } catch (error) {
    console.error('Erreur lors de la récupération du produit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/products', authenticateAdmin, async (req, res) => {
  try {
    const { name, price, image, secondImage, additionalImages, category, collection, color, isNew, briefDescription, surcharge1m20, surchargeSurMesure, disponible } = req.body;

    if (!name || !price || !image || !category || !collection) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const sizes = defaultSizes(category);
    const colors = Array.isArray(color) ? color : (color ? color.split(',').map(c => c.trim()) : []);
    const values = {
      name,
      price: parseFloat(price),
      image,
      second_image: secondImage || null,
      additional_images: toJson(additionalImages || []),
      category,
      collection,
      color: toJson(colors),
      sizes: toJson(sizes),
      surcharge_1m20: surcharge1m20 !== undefined && surcharge1m20 !== '' && surcharge1m20 !== null ? parseFloat(String(surcharge1m20).replace(',', '.')) : null,
      surcharge_sur_mesure: surchargeSurMesure !== undefined && surchargeSurMesure !== '' && surchargeSurMesure !== null ? parseFloat(String(surchargeSurMesure).replace(',', '.')) : null,
      is_new: isNew ? 1 : 0,
      disponible: disponible !== undefined ? (disponible ? 1 : 0) : 1,
      brief_description: briefDescription ? String(briefDescription).trim().slice(0, 500) : '',
    };

    // id métier incrémental : MAX(id)+1 dans une transaction, pour que deux
    // créations concurrentes ne retombent pas sur le même numéro.
    const newId = await transaction(async (conn) => {
      const [{ next_id: nextId }] = await conn.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM products FOR UPDATE');
      await conn.query(
        'INSERT INTO products (id, name, price, image, second_image, additional_images, category, `collection`, color, sizes, surcharge_1m20, surcharge_sur_mesure, is_new, disponible, brief_description) '
        + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [nextId, values.name, values.price, values.image, values.second_image, values.additional_images,
         values.category, values.collection, values.color, values.sizes, values.surcharge_1m20,
         values.surcharge_sur_mesure, values.is_new, values.disponible, values.brief_description]
      );
      return Number(nextId);
    });

    const product = await queryOne('SELECT * FROM products WHERE id = ?', [newId]);
    res.status(201).json(mapProductFull(product));
  } catch (error) {
    console.error('Erreur lors de la création du produit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const { name, price, image, secondImage, additionalImages, category, collection, color, isNew, briefDescription, surcharge1m20, surchargeSurMesure, disponible } = req.body;

    const updates = ['updated_at = NOW(3)'];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (price !== undefined) { updates.push('price = ?'); values.push(parseFloat(price)); }
    if (image !== undefined) { updates.push('image = ?'); values.push(image); }
    if (secondImage !== undefined) { updates.push('second_image = ?'); values.push(secondImage); }
    if (additionalImages !== undefined) {
      const list = Array.isArray(additionalImages) ? additionalImages : [];
      updates.push('additional_images = ?');
      values.push(toJson(list.filter((u) => typeof u === 'string' && u.trim().length > 0)));
    }
    if (category) {
      updates.push('category = ?', 'sizes = ?');
      values.push(category, toJson(defaultSizes(category)));
    }
    if (collection) { updates.push('`collection` = ?'); values.push(collection); }
    if (color !== undefined) {
      updates.push('color = ?');
      values.push(toJson(Array.isArray(color) ? color : (color ? color.split(',').map(c => c.trim()) : [])));
    }
    if (surcharge1m20 !== undefined) {
      updates.push('surcharge_1m20 = ?');
      values.push(surcharge1m20 !== '' && surcharge1m20 !== null ? parseFloat(String(surcharge1m20).replace(',', '.')) : null);
    }
    if (surchargeSurMesure !== undefined) {
      updates.push('surcharge_sur_mesure = ?');
      values.push(surchargeSurMesure !== '' && surchargeSurMesure !== null ? parseFloat(String(surchargeSurMesure).replace(',', '.')) : null);
    }
    if (briefDescription !== undefined) {
      updates.push('brief_description = ?');
      values.push(briefDescription ? String(briefDescription).trim().slice(0, 500) : '');
    }
    if (isNew !== undefined) { updates.push('is_new = ?'); values.push(isNew ? 1 : 0); }
    if (disponible !== undefined) { updates.push('disponible = ?'); values.push(disponible ? 1 : 0); }

    values.push(productId);
    const result = await query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    const updatedProduct = await queryOne('SELECT * FROM products WHERE id = ?', [productId]);
    res.json({ message: 'Produit mis à jour', product: mapProductFull(updatedProduct) });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du produit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const result = await query('DELETE FROM products WHERE id = ?', [parseInt(req.params.id, 10)]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    res.json({ message: 'Produit supprimé' });
  } catch (error) {
    console.error('Erreur lors de la suppression du produit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/images/upload', authenticateAdmin, async (req, res) => {
  try {
    const { image, name } = req.body;
    if (!image || !name) {
      return res.status(400).json({ error: 'Image et nom requis' });
    }
    if (typeof image !== 'string' || typeof name !== 'string') {
      return res.status(400).json({ error: 'Types de données invalides' });
    }
    if (name.length > 255 || image.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Données trop volumineuses' });
    }
    const id = randomUUID();
    const imageName = name.slice(0, 255);
    await query(
      "INSERT INTO images (id, name, data, uploaded_by, type) VALUES (?, ?, ?, 'admin', 'product')",
      [id, imageName, image]
    );
    res.status(201).json({ id, name: imageName, url: `data:image/jpeg;base64,${image}` });
  } catch (error) {
    console.error('Erreur lors de l\'upload de l\'image:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/gallery', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * limit;
    const [{ total }] = await query('SELECT COUNT(*) AS total FROM gallery');
    const images = await query(
      'SELECT id, name, data, type, created_at FROM gallery ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
      [limit, skip]
    );
    res.set('Cache-Control', 'private, max-age=60');
    res.json({
      images: images.map(img => ({
        id: img.id,
        name: img.name,
        data: img.data,
        type: img.type,
        createdAt: img.created_at
      })),
      total: Number(total),
      page,
      totalPages: Math.ceil(Number(total) / limit)
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la galerie:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/gallery', authenticateAdmin, async (req, res) => {
  try {
    const { image, name, type } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image requise' });
    }
    if (!name || name.trim().length < 1 || name.trim().length > 200) {
      return res.status(400).json({ error: 'Nom requis (1-200 caractères)' });
    }
    if (typeof image !== 'string' || image.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image trop volumineuse (max 10MB)' });
    }
    const id = randomUUID();
    const galleryItem = {
      name: name.trim(),
      data: image,
      type: type === 'professional' || type === 'client' ? type : 'professional',
      uploadedBy: 'admin',
    };
    await query(
      "INSERT INTO gallery (id, name, data, type, uploaded_by) VALUES (?, ?, ?, ?, 'admin')",
      [id, galleryItem.name, galleryItem.data, galleryItem.type]
    );
    const created = await queryOne('SELECT created_at, updated_at FROM gallery WHERE id = ?', [id]);
    res.status(201).json({
      id,
      ...galleryItem,
      createdAt: created.created_at,
      updatedAt: created.updated_at
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout à la galerie:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/gallery/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, type, image } = req.body;
    if (!name || name.trim().length < 1 || name.trim().length > 200) {
      return res.status(400).json({ error: 'Nom requis (1-200 caractères)' });
    }
    const updates = ['name = ?', 'type = ?', 'updated_at = NOW(3)'];
    const values = [name.trim(), type === 'professional' || type === 'client' ? type : 'professional'];
    if (image) {
      updates.push('data = ?');
      values.push(image);
    }
    values.push(req.params.id);
    const result = await query(`UPDATE gallery SET ${updates.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Image non trouvée' });
    }
    res.json({ message: 'Image mise à jour' });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'image:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/gallery/:id', authenticateAdmin, async (req, res) => {
  try {
    const result = await query('DELETE FROM gallery WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Image non trouvée' });
    }
    res.json({ message: 'Image supprimée' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'image:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/collections', async (req, res) => {
  try {
    const collections = await query('SELECT id, name, created_at, updated_at FROM collections ORDER BY name ASC');
    res.json(collections.map(col => ({
      id: col.id,
      name: col.name,
      createdAt: col.created_at,
      updatedAt: col.updated_at
    })));
  } catch (error) {
    console.error('Erreur lors de la récupération des collections:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/collections', authenticateAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 1 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Nom requis (1-100 caractères)' });
    }
    const id = randomUUID();
    try {
      // La collation utf8mb4_unicode_ci rend l'unicité insensible à la casse.
      await query('INSERT INTO collections (id, name) VALUES (?, ?)', [id, name.trim()]);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Une collection avec ce nom existe déjà' });
      }
      throw err;
    }
    const created = await queryOne('SELECT name, created_at, updated_at FROM collections WHERE id = ?', [id]);
    res.status(201).json({ id, name: created.name, createdAt: created.created_at, updatedAt: created.updated_at });
  } catch (error) {
    console.error('Erreur lors de la création de la collection:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/collections/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 1 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Nom requis (1-100 caractères)' });
    }
    let result;
    try {
      result = await query(
        'UPDATE collections SET name = ?, updated_at = NOW(3) WHERE id = ?',
        [name.trim(), req.params.id]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Une collection avec ce nom existe déjà' });
      }
      throw err;
    }
    if (result.affectedRows === 0) {
      const exists = await queryOne('SELECT id FROM collections WHERE id = ?', [req.params.id]);
      if (!exists) return res.status(404).json({ error: 'Collection non trouvée' });
    }
    res.json({ message: 'Collection mise à jour' });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la collection:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/collections/:id', authenticateAdmin, async (req, res) => {
  try {
    const collection = await queryOne('SELECT name FROM collections WHERE id = ?', [req.params.id]);
    if (!collection) {
      return res.status(404).json({ error: 'Collection non trouvée' });
    }
    const [{ total }] = await query('SELECT COUNT(*) AS total FROM products WHERE `collection` = ?', [collection.name]);
    if (Number(total) > 0) {
      return res.status(400).json({ error: 'Impossible de supprimer cette collection car elle est utilisée par des produits' });
    }
    const result = await query('DELETE FROM collections WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Collection non trouvée' });
    }
    res.json({ message: 'Collection supprimée' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la collection:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/faq', async (req, res) => {
  try {
    const faqs = await query('SELECT * FROM faq ORDER BY sort_order ASC, created_at ASC');
    res.json(faqs.map(faq => ({
      id: faq.id,
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      order: faq.display_order || 0,
      categoryOrder: faq.category_order || 0,
      sortOrder: faq.sort_order,
      createdAt: faq.created_at,
      updatedAt: faq.updated_at
    })));
  } catch (error) {
    console.error('Erreur lors de la récupération de la FAQ:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/faq', authenticateAdmin, async (req, res) => {
  try {
    const { category, question, answer, order, categoryOrder } = req.body;
    if (!category || category.trim().length < 1 || category.trim().length > 100) {
      return res.status(400).json({ error: 'Catégorie requise (1-100 caractères)' });
    }
    if (!question || question.trim().length < 1 || question.trim().length > 500) {
      return res.status(400).json({ error: 'Question requise (1-500 caractères)' });
    }
    if (!answer || answer.trim().length < 1 || answer.trim().length > 5000) {
      return res.status(400).json({ error: 'Réponse requise (1-5000 caractères)' });
    }
    const [{ next_sort: nextSortOrder }] = await query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM faq');
    const id = randomUUID();
    const faqItem = {
      category: category.trim(),
      question: question.trim(),
      answer: answer.trim(),
      order: order || 0,
      categoryOrder: categoryOrder || 0,
      sortOrder: Number(nextSortOrder),
    };
    await query(
      'INSERT INTO faq (id, category, question, answer, display_order, category_order, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, faqItem.category, faqItem.question, faqItem.answer, faqItem.order, faqItem.categoryOrder, faqItem.sortOrder]
    );
    const created = await queryOne('SELECT created_at, updated_at FROM faq WHERE id = ?', [id]);
    res.status(201).json({ id, ...faqItem, createdAt: created.created_at, updatedAt: created.updated_at });
  } catch (error) {
    console.error('Erreur lors de la création de la FAQ:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/faq/:id', authenticateAdmin, async (req, res) => {
  try {
    const { category, question, answer, order, categoryOrder } = req.body;
    if (!category || category.trim().length < 1 || category.trim().length > 100) {
      return res.status(400).json({ error: 'Catégorie requise (1-100 caractères)' });
    }
    if (!question || question.trim().length < 1 || question.trim().length > 500) {
      return res.status(400).json({ error: 'Question requise (1-500 caractères)' });
    }
    if (!answer || answer.trim().length < 1 || answer.trim().length > 5000) {
      return res.status(400).json({ error: 'Réponse requise (1-5000 caractères)' });
    }
    const result = await query(
      'UPDATE faq SET category = ?, question = ?, answer = ?, display_order = ?, category_order = ?, updated_at = NOW(3) WHERE id = ?',
      [category.trim(), question.trim(), answer.trim(), order || 0, categoryOrder || 0, req.params.id]
    );
    if (result.affectedRows === 0) {
      const exists = await queryOne('SELECT id FROM faq WHERE id = ?', [req.params.id]);
      if (!exists) return res.status(404).json({ error: 'FAQ non trouvée' });
    }
    res.json({ message: 'FAQ mise à jour' });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la FAQ:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.patch('/api/faq/reorder', authenticateAdmin, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items requis (tableau [{ id, sortOrder }])' });
    }
    await transaction(async (conn) => {
      for (const it of items) {
        const { id, sortOrder } = it;
        if (!id || typeof sortOrder !== 'number') continue;
        await conn.query('UPDATE faq SET sort_order = ?, updated_at = NOW(3) WHERE id = ?', [sortOrder, id]);
      }
    });
    res.json({ message: 'Ordre mis à jour' });
  } catch (error) {
    console.error('Erreur lors du réordonnancement FAQ:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/faq/:id', authenticateAdmin, async (req, res) => {
  try {
    const result = await query('DELETE FROM faq WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'FAQ non trouvée' });
    }
    res.json({ message: 'FAQ supprimée' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la FAQ:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Settings (surmesurecollier, surmesureharnais, laisse1m20) - modifiables dans l'admin
app.get('/api/settings', async (req, res) => {
  try {
    const doc = await queryOne('SELECT * FROM settings WHERE id = ?', ['pricing']);
    res.json({
      surmesurecollier: toNum(doc?.surmesurecollier),
      surmesureharnais: toNum(doc?.surmesureharnais),
      laisse1m20: toNum(doc?.laisse_1m20)
    });
  } catch (error) {
    console.error('Erreur settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/settings', authenticateAdmin, async (req, res) => {
  try {
    const { surmesurecollier, surmesureharnais, laisse1m20 } = req.body;
    const parsePrice = (v) => (v === '' || v === null ? null : parseFloat(String(v).replace(',', '.')));
    const columns = { surmesurecollier: 'surmesurecollier', surmesureharnais: 'surmesureharnais', laisse1m20: 'laisse_1m20' };
    const provided = { surmesurecollier, surmesureharnais, laisse1m20 };

    const setColumns = [];
    const setValues = [];
    for (const [key, column] of Object.entries(columns)) {
      if (provided[key] !== undefined) {
        setColumns.push(column);
        setValues.push(parsePrice(provided[key]));
      }
    }

    // Upsert de la ligne unique 'pricing' (équivalent du { upsert: true } Mongo).
    if (setColumns.length > 0) {
      await query(
        `INSERT INTO settings (id, ${setColumns.join(', ')}, updated_at) VALUES (?, ${placeholders(setColumns.length)}, NOW(3)) `
        + `ON DUPLICATE KEY UPDATE ${setColumns.map(c => `${c} = VALUES(${c})`).join(', ')}, updated_at = NOW(3)`,
        ['pricing', ...setValues]
      );
    } else {
      await query('INSERT INTO settings (id, updated_at) VALUES (?, NOW(3)) ON DUPLICATE KEY UPDATE updated_at = NOW(3)', ['pricing']);
    }

    const doc = await queryOne('SELECT * FROM settings WHERE id = ?', ['pricing']);
    res.json({
      surmesurecollier: toNum(doc?.surmesurecollier),
      surmesureharnais: toNum(doc?.surmesureharnais),
      laisse1m20: toNum(doc?.laisse_1m20)
    });
  } catch (error) {
    console.error('Erreur mise à jour settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------------------------------------------------------------
// Panier — une ligne par (user, produit, taille).
// La taille absente est stockée en chaîne vide (une clé primaire ne dédupliquerait
// pas des NULL) et omise de la réponse JSON, comme le faisait le tableau Mongo.
// ---------------------------------------------------------------------------
async function getCartItems(userId) {
  const rows = await query(
    'SELECT product_id, quantity, size FROM cart_items WHERE user_id = ? ORDER BY added_at ASC, product_id ASC',
    [userId]
  );
  return rows.map(row => {
    const item = { productId: row.product_id, quantity: row.quantity };
    if (row.size) item.size = row.size;
    return item;
  });
}

app.get('/api/cart', authenticateToken, async (req, res) => {
  try {
    res.json(await getCartItems(req.user.userId));
  } catch (error) {
    console.error('Erreur lors de la récupération du panier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/cart', authenticateToken, async (req, res) => {
  try {
    const { productId, quantity, size } = req.body;
    if (!productId || !quantity) {
      return res.status(400).json({ error: 'Produit et quantité requis' });
    }
    const productIdInt = parseInt(productId, 10);
    const quantityInt = parseInt(quantity, 10);
    if (!Number.isInteger(productIdInt) || !Number.isInteger(quantityInt)) {
      return res.status(400).json({ error: 'Produit et quantité invalides' });
    }
    const sizeKey = size != null && size !== '' ? String(size).slice(0, 20) : '';
    await query(
      'INSERT INTO cart_items (user_id, product_id, size, quantity) VALUES (?, ?, ?, ?) '
      + 'ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity), updated_at = NOW(3)',
      [req.user.userId, productIdInt, sizeKey, quantityInt]
    );
    res.json({ items: await getCartItems(req.user.userId) });
  } catch (error) {
    console.error('Erreur lors de l\'ajout au panier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/cart/:productId', authenticateToken, async (req, res) => {
  try {
    const { quantity, size } = req.body;
    const [{ total }] = await query('SELECT COUNT(*) AS total FROM cart_items WHERE user_id = ?', [req.user.userId]);
    if (Number(total) === 0) {
      return res.status(404).json({ error: 'Panier non trouvé' });
    }
    const sizeKey = size != null && size !== '' ? String(size).slice(0, 20) : '';
    const productId = parseInt(req.params.productId, 10);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Produit invalide' });
    }
    if (quantity > 0) {
      await query(
        'INSERT INTO cart_items (user_id, product_id, size, quantity) VALUES (?, ?, ?, ?) '
        + 'ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_at = NOW(3)',
        [req.user.userId, productId, sizeKey, parseInt(quantity, 10)]
      );
    } else {
      await query(
        'DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?',
        [req.user.userId, productId, sizeKey]
      );
    }
    res.json({ items: await getCartItems(req.user.userId) });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du panier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/cart/:productId', authenticateToken, async (req, res) => {
  try {
    const size = req.query.size;
    const [{ total }] = await query('SELECT COUNT(*) AS total FROM cart_items WHERE user_id = ?', [req.user.userId]);
    if (Number(total) === 0) {
      return res.status(404).json({ error: 'Panier non trouvé' });
    }
    const sizeKey = size != null && size !== '' ? String(size).slice(0, 20) : '';
    const productId = parseInt(req.params.productId, 10);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Produit invalide' });
    }
    await query(
      'DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?',
      [req.user.userId, productId, sizeKey]
    );
    res.json({ items: await getCartItems(req.user.userId) });
  } catch (error) {
    console.error('Erreur lors de la suppression du panier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function getFavoriteIds(userId) {
  const rows = await query(
    'SELECT product_id FROM favorites WHERE user_id = ? ORDER BY created_at ASC, product_id ASC',
    [userId]
  );
  return rows.map(row => row.product_id);
}

app.get('/api/favorites', authenticateToken, async (req, res) => {
  try {
    res.json(await getFavoriteIds(req.user.userId));
  } catch (error) {
    console.error('Erreur lors de la récupération des favoris:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'Produit requis' });
    }
    const productIdInt = parseInt(productId, 10);
    if (!Number.isInteger(productIdInt)) {
      return res.status(400).json({ error: 'Produit invalide' });
    }
    await query(
      'INSERT IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)',
      [req.user.userId, productIdInt]
    );
    res.json({ productIds: await getFavoriteIds(req.user.userId) });
  } catch (error) {
    console.error('Erreur lors de l\'ajout aux favoris:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/favorites/:productId', authenticateToken, async (req, res) => {
  try {
    const [{ total }] = await query('SELECT COUNT(*) AS total FROM favorites WHERE user_id = ?', [req.user.userId]);
    if (Number(total) === 0) {
      return res.status(404).json({ error: 'Favoris non trouvés' });
    }
    await query(
      'DELETE FROM favorites WHERE user_id = ? AND product_id = ?',
      [req.user.userId, parseInt(req.params.productId, 10)]
    );
    res.json({ productIds: await getFavoriteIds(req.user.userId) });
  } catch (error) {
    console.error('Erreur lors de la suppression des favoris:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const ORDER_SHIPPING = 5.9;
const ORDER_FEES_TAUX = 0.019;

app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { items, shippingAddress, dogInfo, notes, promoCode } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items requis' });
    }
    if (items.length > 50) {
      return res.status(400).json({ error: 'Trop d\'articles dans la commande' });
    }
    if (!shippingAddress) {
      return res.status(400).json({ error: 'Informations de contact requises' });
    }
    if (!dogInfo || !dogInfo.breed || !dogInfo.age) {
      return res.status(400).json({ error: 'Informations sur le chien requises (race et âge)' });
    }

    // Recalcul serveur : on ne fait jamais confiance au total client
    const productIds = items.map(i => i.productId).filter(id => typeof id === 'number' && !isNaN(id));
    if (productIds.length !== items.length) {
      return res.status(400).json({ error: 'IDs de produits invalides' });
    }
    const uniqueIds = [...new Set(productIds)];
    const dbProducts = await query(
      `SELECT id, price, category, surcharge_1m20, surcharge_sur_mesure FROM products WHERE id IN (${placeholders(uniqueIds.length)})`,
      uniqueIds
    );
    const productMap = Object.fromEntries(dbProducts.map(p => [p.id, p]));

    let subtotal = 0;
    const validatedItems = [];
    for (const item of items) {
      const product = productMap[item.productId];
      if (!product) {
        return res.status(400).json({ error: `Produit #${item.productId} introuvable` });
      }
      const qty = Math.max(1, Math.min(99, parseInt(item.quantity) || 1));
      let unitPrice = toNum(product.price);
      const surcharge1m20 = toNum(product.surcharge_1m20) ?? 0;
      const surchargeSurMesure = toNum(product.surcharge_sur_mesure) ?? 0;
      if (product.category === 'laisses' && item.size === '1m20' && surcharge1m20 > 0) {
        unitPrice += surcharge1m20;
      }
      if (product.category === 'colliers' && dogInfo.surMesureCollier && surchargeSurMesure > 0) {
        unitPrice += surchargeSurMesure;
      }
      if (product.category === 'harnais' && dogInfo.surMesureHarnais && surchargeSurMesure > 0) {
        unitPrice += surchargeSurMesure;
      }
      subtotal += unitPrice * qty;
      validatedItems.push({ productId: item.productId, quantity: qty, price: unitPrice, size: item.size || null });
    }

    const shippingAmount = ORDER_SHIPPING;
    const feesAmount = Math.round((subtotal + shippingAmount) * ORDER_FEES_TAUX * 100) / 100;
    const total = Math.round((subtotal + shippingAmount + feesAmount) * 100) / 100;

    let validatedPromoCode = null;
    if (promoCode && typeof promoCode === 'string' && promoCode.trim() !== '') {
      const promo = await queryOne('SELECT * FROM promo_codes WHERE code = ?', [promoCode.toUpperCase().trim()]);

      if (promo && toBool(promo.is_active) && promo.current_uses < promo.max_uses) {
        const now = new Date();
        const isValidDate = (!promo.start_date || new Date(promo.start_date) <= now) &&
                           (!promo.end_date || new Date(promo.end_date) >= now);

        if (isValidDate) {
          validatedPromoCode = {
            code: promo.code,
            name: promo.name,
            discountType: promo.discount_type,
            discountValue: toNum(promo.discount_value)
          };
        }
      }
    }

    const orderId = randomUUID();
    const ship = shippingAddress || {};

    // Numérotation atomique (art. 242 nonies A CGI: séquence sans rupture).
    // INSERT ... ON DUPLICATE KEY UPDATE seq = LAST_INSERT_ID(seq + 1) est atomique
    // et, pris dans la transaction, ne consomme pas de numéro si l'insertion échoue.
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const dayPrefix = `${year}${month}${day}`;

    const orderNumber = await transaction(async (conn) => {
      const counterResult = await conn.query(
        'INSERT INTO counters (name, seq) VALUES (?, 1) ON DUPLICATE KEY UPDATE seq = LAST_INSERT_ID(seq + 1)',
        [`orders:${dayPrefix}`]
      );
      // affectedRows 1 = ligne créée (seq = 1) ; 2 = ligne incrémentée (seq = insertId)
      const seq = counterResult.affectedRows === 1 ? 1 : Number(counterResult.insertId);
      if (!Number.isInteger(seq) || seq < 1) {
        throw new Error('Compteur de numérotation indisponible');
      }
      const number = `${dayPrefix}${seq.toString().padStart(4, '0')}`;

      await conn.query(
        'INSERT INTO orders (id, order_number, user_id, ship_first_name, ship_last_name, ship_email, ship_phone, '
        + 'ship_address, ship_city, ship_postal_code, ship_country, dog_breed, dog_age, dog_tour_de_cou, '
        + 'dog_tour_de_taille, dog_sur_mesure_collier, dog_sur_mesure_harnais, notes, total, original_total, '
        + 'promo_code, shipping_amount, fees_amount, status) '
        + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          orderId, number, req.user.userId,
          ship.firstName ?? null, ship.lastName ?? null, ship.email ?? null, ship.phone ?? null,
          ship.address ?? null, ship.city ?? null, ship.postalCode ?? null, ship.country ?? null,
          dogInfo.breed, dogInfo.age, dogInfo.tourDeCou || null, dogInfo.tourDeTaille || null,
          dogInfo.surMesureCollier ? 1 : 0, dogInfo.surMesureHarnais ? 1 : 0,
          notes || '', total, validatedPromoCode ? total : null,
          toJson(validatedPromoCode), shippingAmount, feesAmount, 'pending_validation'
        ]
      );
      await replaceOrderItems(conn, orderId, validatedItems);
      await conn.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.userId]);
      return number;
    });

    const order = await findOrderById(orderId);

    try {
      const user = await queryOne(
        'SELECT email, first_name, last_name FROM users WHERE id = ?',
        [req.user.userId]
      );
      const productMap = await getProductMapByIds((order.items || []).map(i => i.productId));
      const shipOut = order.shippingAddress || {};
      const itemsForEmail = (order.items || []).map(item => ({
        name: (productMap[item.productId] && productMap[item.productId].name) || `Produit #${item.productId}`,
        quantity: item.quantity,
        price: item.price
      }));
      const shippingCost = order.shippingAmount != null ? Number(order.shippingAmount) : 5.9;
      const dogInfoStr = order.dogInfo ? `Race: ${order.dogInfo.breed || ''}\nÂge: ${order.dogInfo.age || ''}${order.dogInfo.tourDeCou ? `\nTour de cou: ${order.dogInfo.tourDeCou}` : ''}${order.dogInfo.tourDeTaille ? `\nTour de taille: ${order.dogInfo.tourDeTaille}` : ''}` : '';
      const orderData = {
        orderNumber: orderNumber,
        firstName: shipOut.firstName || user?.first_name || '',
        lastName: shipOut.lastName || user?.last_name || '',
        items: itemsForEmail,
        totalAmount: Number(order.total),
        shippingCost,
        shippingAddress: shipOut,
        customerName: [shipOut.firstName, shipOut.lastName].filter(Boolean).join(' ') || (user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'Client'),
        customerEmail: shipOut.email || user?.email || '',
        customerPhone: shipOut.phone || '',
        paymentMethod: 'En attente de validation',
        dogInfo: dogInfoStr || undefined,
        notes: order.notes || undefined
      };
      await sendNewOrderNotificationEmail(orderData);
    } catch (emailErr) {
      console.error('Erreur envoi email nouvelle commande (non-bloquant):', emailErr);
    }

    res.status(201).json(order);
  } catch (error) {
    console.error('Erreur lors de la création de la commande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Charge les lignes de plusieurs commandes en une requête, groupées par commande. */
async function getItemsByOrderIds(orderIds) {
  if (orderIds.length === 0) return {};
  const rows = await query(
    `SELECT order_id, product_id, quantity, price, size FROM order_items `
    + `WHERE order_id IN (${placeholders(orderIds.length)}) ORDER BY position, id`,
    orderIds
  );
  const grouped = Object.fromEntries(orderIds.map(id => [id, []]));
  for (const row of rows) {
    grouped[row.order_id].push(mapOrderItem(row));
  }
  return grouped;
}

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      [req.user.userId]
    );
    const itemsByOrder = await getItemsByOrderIds(rows.map(r => r.id));
    res.json(rows.map(row => {
      const order = mapOrder(row, itemsByOrder[row.id]);
      delete order.userId;
      return order;
    }));
  } catch (error) {
    console.error('Erreur lors de la récupération des commandes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/orders/admin', authenticateAdmin, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM orders ORDER BY created_at DESC, id DESC');
    const itemsByOrder = await getItemsByOrderIds(rows.map(r => r.id));

    const userIds = [...new Set(rows.map(o => o.user_id).filter(Boolean))];
    const users = userIds.length > 0
      ? await query(
          `SELECT id, email, first_name, last_name FROM users WHERE id IN (${placeholders(userIds.length)})`,
          userIds
        )
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    res.json(rows.map((row) => {
      const user = userMap[row.user_id] || null;
      const order = mapOrder(row, itemsByOrder[row.id]);
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        user: user ? { email: user.email, firstName: user.first_name, lastName: user.last_name } : null,
        items: order.items,
        shippingAddress: order.shippingAddress,
        dogInfo: order.dogInfo,
        notes: order.notes,
        total: order.total,
        status: order.status,
        counterProposal: order.counterProposal,
        paymentInfo: order.paymentInfo,
        rejectionReason: order.rejectionReason,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    }));
  } catch (error) {
    console.error('Erreur lors de la récupération des commandes admin:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Construit le payload email d'une commande validée / payée. */
async function buildOrderEmailData(order, { withContact = false, withNames = true } = {}) {
  const user = await queryOne('SELECT email, first_name, last_name FROM users WHERE id = ?', [order.userId]);
  const productMap = await getProductMapByIds((order.items || []).map(i => i.productId));
  const ship = order.shippingAddress || {};
  const itemsForEmail = (order.items || []).map(item => ({
    name: (productMap[item.productId] && productMap[item.productId].name) || `Produit #${item.productId}`,
    quantity: item.quantity,
    price: item.price
  }));
  const shippingCost = order.shippingAmount != null ? Number(order.shippingAmount) : 5.9;
  const orderData = {
    orderNumber: order.orderNumber || order.id,
    ...(withNames ? {
      firstName: ship.firstName || user?.first_name || '',
      lastName: ship.lastName || user?.last_name || '',
    } : {}),
    items: itemsForEmail,
    totalAmount: Number(order.total),
    shippingCost,
    customerName: [ship.firstName, ship.lastName].filter(Boolean).join(' ') || (user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'Client')
  };
  if (withContact) {
    orderData.shippingAddress = ship;
    orderData.customerEmail = ship.email || user?.email || '';
    orderData.customerPhone = ship.phone || '';
  }
  return { orderData, clientEmail: ship.email || user?.email };
}

app.put('/api/orders/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status, rejectionReason, counterProposal } = req.body;
    const validStatuses = ['pending_validation', 'pending_counter_proposal', 'validated', 'paid', 'shipping', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }
    const order = await findOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    const updates = ['status = ?', 'updated_at = NOW(3)'];
    const values = [status];
    let itemsToReplace = null;

    if (status === 'rejected' && rejectionReason) {
      updates.push('rejection_reason = ?', 'counter_proposal = NULL');
      values.push(rejectionReason);
    }
    if (status === 'pending_validation' && counterProposal) {
      updates.push('counter_proposal = ?');
      values.push(toJson({
        items: counterProposal.items,
        total: counterProposal.total,
        message: counterProposal.message || '',
        proposedAt: new Date()
      }));
      values[0] = 'pending_counter_proposal';
    }
    if (status === 'validated') {
      if (order.counterProposal) {
        itemsToReplace = order.counterProposal.items;
        updates.push('total = ?');
        values.push(order.counterProposal.total);
      }
      updates.push('counter_proposal = NULL');
    }
    if (status === 'paid') {
      // Les champs déjà présents priment : un paiement Stripe validé ne doit pas
      // être réécrit en « admin » par un simple changement de statut.
      updates.push('payment_info = ?');
      values.push(toJson({ method: 'admin', paidAt: new Date(), ...(order.paymentInfo || {}) }));
    }

    values.push(req.params.id);
    const result = await transaction(async (conn) => {
      const r = await conn.query(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, values);
      if (itemsToReplace) await replaceOrderItems(conn, req.params.id, itemsToReplace);
      return r;
    });
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    if (status === 'validated') {
      try {
        const updatedOrder = await findOrderById(req.params.id);
        const { orderData, clientEmail } = await buildOrderEmailData(updatedOrder);
        if (clientEmail) {
          await sendOrderValidatedEmail(clientEmail, orderData);
        }
      } catch (emailErr) {
        console.error('Erreur envoi email commande validée (non-bloquant):', emailErr);
      }
    }

    if (status === 'paid') {
      const updatedOrder = await findOrderById(req.params.id);
      await insertPaymentStat(updatedOrder);
    }

    res.json({ message: 'Statut mis à jour', status });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/orders/:id/counter-proposal', authenticateToken, async (req, res) => {
  try {
    const { accept, newProposal } = req.body;
    const order = await findOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    if (order.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    if (order.status !== 'pending_counter_proposal') {
      return res.status(400).json({ error: 'La commande n\'est pas en attente de contre-proposition' });
    }
    if (accept) {
      await transaction(async (conn) => {
        await conn.query(
          "UPDATE orders SET total = ?, status = 'validated', counter_proposal = NULL, updated_at = NOW(3) WHERE id = ?",
          [order.counterProposal.total, req.params.id]
        );
        await replaceOrderItems(conn, req.params.id, order.counterProposal.items);
      });
      try {
        const updatedOrder = await findOrderById(req.params.id);
        const { orderData, clientEmail } = await buildOrderEmailData(updatedOrder, { withNames: false });
        if (clientEmail) {
          await sendOrderValidatedEmail(clientEmail, orderData);
        }
      } catch (emailErr) {
        console.error('Erreur envoi email commande validée (non-bloquant):', emailErr);
      }
      res.json({ message: 'Contre-proposition acceptée', status: 'validated' });
    } else if (newProposal) {
      await query(
        "UPDATE orders SET counter_proposal = ?, status = 'pending_validation', updated_at = NOW(3) WHERE id = ?",
        [toJson({
          items: newProposal.items,
          total: newProposal.total,
          message: newProposal.message || '',
          proposedAt: new Date()
        }), req.params.id]
      );
      res.json({ message: 'Nouvelle contre-proposition envoyée', status: 'pending_validation' });
    } else {
      return res.status(400).json({ error: 'Action invalide' });
    }
  } catch (error) {
    console.error('Erreur lors de la gestion de la contre-proposition:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const order = await queryOne('SELECT user_id, status FROM orders WHERE id = ?', [req.params.id]);
    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    if (order.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    const deletableStatuses = ['pending_validation', 'pending_counter_proposal', 'validated', 'rejected'];
    if (!deletableStatuses.includes(order.status)) {
      return res.status(400).json({ error: 'Cette commande ne peut pas être supprimée (déjà payée ou en cours)' });
    }
    // order_items suit par ON DELETE CASCADE
    await query('DELETE FROM orders WHERE id = ?', [req.params.id]);
    res.json({ message: 'Commande supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la commande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/orders/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const order = await queryOne('SELECT user_id, status FROM orders WHERE id = ?', [req.params.id]);
    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    if (order.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    const nonPayableStatuses = ['pending_validation', 'pending_counter_proposal', 'validated'];
    if (!nonPayableStatuses.includes(order.status)) {
      return res.status(400).json({ error: 'Cette commande ne peut pas être annulée (déjà payée ou en cours)' });
    }
    await query(
      "UPDATE orders SET status = 'rejected', rejection_reason = 'Annulée par le client', updated_at = NOW(3) WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Commande annulée avec succès', status: 'rejected' });
  } catch (error) {
    console.error('Erreur lors de l\'annulation de la commande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    const clientIp = req.ip || req.socket?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (await isIpBanned(clientIp)) {
      return res.status(403).json({ error: 'Accès temporairement bloqué. Veuillez réessayer plus tard.' });
    }

    const cooldown = await getCooldownTime(clientIp);
    if (cooldown > 0) {
      return res.status(429).json({ 
        error: `Trop de tentatives. Veuillez attendre ${Math.ceil(cooldown / 1000)} secondes.`,
        cooldown: Math.ceil(cooldown / 1000)
      });
    }

    if (!password || typeof password !== 'string') {
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      await logAdminAttempt(clientIp, false, { reason: 'Mot de passe invalide', userAgent });
      return res.status(400).json({ error: 'Identifiants invalides' });
    }

    if (password.length < 8 || password.length > 128) {
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      await logAdminAttempt(clientIp, false, { reason: 'Longueur de mot de passe invalide', userAgent });
      return res.status(400).json({ error: 'Identifiants invalides' });
    }

    const adminAuth = await queryOne('SELECT id, password_hash FROM admin_auth LIMIT 1');
    if (!adminAuth) {
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
      await logAdminAttempt(clientIp, false, { reason: 'Configuration admin introuvable', userAgent });
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const startTime = Date.now();
    const passwordMatch = await bcrypt.compare(password, adminAuth.password_hash);
    const elapsedTime = Date.now() - startTime;

    if (!passwordMatch) {
      const delay = Math.max(2000 - elapsedTime, 500) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      await logAdminAttempt(clientIp, false, { reason: 'Mot de passe incorrect', userAgent });
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = jwt.sign(
      { 
        isAdmin: true,
        loginTime: new Date().toISOString()
      },
      JWT_SECRET,
      { expiresIn: ADMIN_JWT_EXPIRATION }
    );

    await logAdminAttempt(clientIp, true, { reason: 'Connexion réussie', userAgent });
    await query('UPDATE admin_auth SET last_login = NOW(3), last_login_ip = ? WHERE id = ?', [clientIp, adminAuth.id]);

    await detectBotPattern();

    // Stocker le token dans un cookie httpOnly (non accessible via JS)
    res.cookie('adminAuthToken', token, getAdminCookieOptions());

    res.json({ message: 'Connexion admin réussie' });
  } catch (error) {
    console.error('Erreur lors de la connexion admin:', error);
    const clientIp = req.ip || req.socket?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    await logAdminAttempt(clientIp, false, { reason: 'Erreur serveur', userAgent });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('adminAuthToken', { path: '/' });
  res.json({ message: 'Déconnexion admin réussie' });
});

async function isIpBanned(ip) {
  try {
    const ban = await queryOne('SELECT ip FROM ip_bans WHERE ip = ? AND expires_at > NOW(3)', [ip]);
    return !!ban;
  } catch (error) {
    console.error('Erreur lors de la vérification du ban:', error);
    return false;
  }
}

async function banIp(ip, durationMinutes = 60) {
  try {
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    await query(
      'INSERT INTO ip_bans (ip, banned_at, expires_at, reason) VALUES (?, NOW(3), ?, ?) '
      + 'ON DUPLICATE KEY UPDATE banned_at = NOW(3), expires_at = VALUES(expires_at), reason = VALUES(reason)',
      [ip, expiresAt, 'Trop de tentatives échouées']
    );
    console.warn(`🚫 IP ${ip} bannie jusqu'à ${expiresAt.toISOString()}`);
  } catch (error) {
    console.error('Erreur lors du ban IP:', error);
  }
}

async function getCooldownTime(ip) {
  try {
    const recentAttempts = await query(
      'SELECT success, timestamp FROM admin_login_attempts WHERE ip = ? AND timestamp >= NOW(3) - INTERVAL 1 HOUR '
      + 'ORDER BY timestamp DESC LIMIT 5',
      [ip]
    );

    if (recentAttempts.length === 0) return 0;

    const failures = recentAttempts.filter(a => !toBool(a.success));
    if (failures.length === 0) return 0;

    const lastFailure = failures[0];
    const timeSinceLastFailure = Date.now() - new Date(lastFailure.timestamp).getTime();

    if (failures.length === 1) return Math.max(0, 5000 - timeSinceLastFailure);
    if (failures.length === 2) return Math.max(0, 30000 - timeSinceLastFailure);
    if (failures.length >= 3) return Math.max(0, 300000 - timeSinceLastFailure);

    return 0;
  } catch (error) {
    console.error('Erreur lors du calcul du cooldown:', error);
    return 0;
  }
}

async function logAdminAttempt(ip, success, reason) {
  try {
    const reasonText = typeof reason === 'string' ? reason : reason.reason || 'Unknown';
    const userAgent = typeof reason === 'object' && reason.userAgent ? reason.userAgent : 'unknown';

    await query(
      'INSERT INTO admin_login_attempts (ip, success, reason, user_agent) VALUES (?, ?, ?, ?)',
      [ip, success ? 1 : 0, String(reasonText).slice(0, 255), String(userAgent).slice(0, 512)]
    );

    if (!success) {
      const [{ total }] = await query(
        'SELECT COUNT(*) AS total FROM admin_login_attempts WHERE ip = ? AND success = 0 AND timestamp >= NOW(3) - INTERVAL 15 MINUTE',
        [ip]
      );
      const recentFailures = Number(total);

      if (recentFailures >= 3) {
        await banIp(ip, 60);
        console.warn(`⚠️  Alerte: ${recentFailures} tentatives échouées depuis ${ip} - IP bannie pour 60 minutes`);
      } else if (recentFailures >= 5) {
        await banIp(ip, 1440);
        console.warn(`🚨 Alerte critique: ${recentFailures} tentatives échouées depuis ${ip} - IP bannie pour 24h`);
      }
    }
  } catch (error) {
    console.error('Erreur lors du logging:', error);
  }
}

async function detectBotPattern() {
  try {
    const attempts = await query(
      'SELECT ip AS _id, COUNT(*) AS count, COUNT(DISTINCT user_agent) AS uniqueUserAgents '
      + 'FROM admin_login_attempts WHERE timestamp >= NOW(3) - INTERVAL 1 HOUR AND success = 0 '
      + 'GROUP BY ip HAVING count >= 10'
    );

    const totalUniqueIps = attempts.length;
    if (totalUniqueIps >= 5) {
      console.warn(`🤖 Pattern bot détecté: ${totalUniqueIps} IPs différentes avec plus de 10 tentatives en 1h`);
    }

    return attempts;
  } catch (error) {
    console.error('Erreur lors de la détection de bot:', error);
    return [];
  }
}

app.get('/api/admin/verify', authenticateAdmin, async (req, res) => {
  try {
    res.json({ 
      valid: true, 
      message: 'Token admin valide',
      expiresIn: ADMIN_JWT_EXPIRATION
    });
  } catch (error) {
    console.error('Erreur lors de la vérification admin:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/stats', authenticateAdmin, async (req, res) => {
  try {
    const { from, to, collection: fCollection, category: fCategory } = req.query;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Un enregistrement = une commande payée, avec le détail de ses lignes.
    const statRows = await query('SELECT id, date, total_amount FROM payment_stats ORDER BY date ASC');
    const itemRows = statRows.length > 0
      ? await query(
          `SELECT payment_stat_id, product_id, \`collection\`, category, quantity, price, item_total `
          + `FROM payment_stat_items WHERE payment_stat_id IN (${placeholders(statRows.length)}) ORDER BY id`,
          statRows.map(r => r.id)
        )
      : [];
    const itemsByStat = Object.fromEntries(statRows.map(r => [r.id, []]));
    for (const item of itemRows) {
      itemsByStat[item.payment_stat_id].push({
        productId: item.product_id,
        collection: item.collection,
        category: item.category,
        quantity: item.quantity,
        price: toNum(item.price),
        itemTotal: toNum(item.item_total),
      });
    }
    const allRecords = statRows.map(r => ({
      date: r.date,
      totalAmount: toNum(r.total_amount),
      items: itemsByStat[r.id],
    }));

    // Global monthly KPIs (never filtered — stable reference)
    let totalRevenue = 0, totalOrders = 0;
    let monthlyRevenue = 0, monthlyOrders = 0;
    let lastMonthRevenue = 0, lastMonthOrders = 0;
    for (const rec of allRecords) {
      const d = rec.date ? new Date(rec.date) : new Date();
      const orderTotal = Number(rec.totalAmount) || 0;
      totalRevenue += orderTotal;
      totalOrders++;
      const dMonthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      if (dMonthStart.getTime() === monthStart.getTime()) { monthlyRevenue += orderTotal; monthlyOrders++; }
      else if (d >= lastMonthStart && d <= lastMonthEnd) { lastMonthRevenue += orderTotal; lastMonthOrders++; }
    }

    // Chart date range (default: last 7 days)
    const fromDate = from ? new Date(String(from)) : (() => { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d; })();
    const toDate = to ? new Date(String(to)) : now;

    // Filtered aggregation for chart + breakdown bars
    const dailyStatsMap = {};
    const collectionStats = {};
    const categoryStats = {};

    for (const rec of allRecords) {
      const d = rec.date ? new Date(rec.date) : new Date();
      if (d < fromDate || d > toDate) continue;

      const orderTotal = Number(rec.totalAmount) || 0;
      const dayKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      let orderMatches = !fCollection && !fCategory;

      for (const item of rec.items || []) {
        const matchCol = !fCollection || item.collection === String(fCollection);
        const matchCat = !fCategory || item.category === String(fCategory);
        if (matchCol && matchCat) {
          const col = item.collection || 'Autre';
          const cat = item.category || 'Autre';
          collectionStats[col] = (collectionStats[col] || 0) + Number(item.itemTotal || 0);
          categoryStats[cat] = (categoryStats[cat] || 0) + Number(item.itemTotal || 0);
          orderMatches = true;
        }
      }

      if (orderMatches) {
        if (!dailyStatsMap[dayKey]) dailyStatsMap[dayKey] = { revenue: 0, orders: 0 };
        dailyStatsMap[dayKey].revenue += orderTotal;
        dailyStatsMap[dayKey].orders += 1;
      }
    }

    // Build chart: daily if ≤ 30 days, weekly otherwise (max 30 bars)
    const daysDiff = Math.max(1, Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000)) + 1);
    const dailyStats = [];
    if (daysDiff <= 30) {
      for (let i = 0; i < daysDiff; i++) {
        const date = new Date(fromDate);
        date.setDate(date.getDate() + i);
        date.setHours(0, 0, 0, 0);
        const s = dailyStatsMap[date.getTime()] || { revenue: 0, orders: 0 };
        const label = daysDiff <= 7
          ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][date.getDay()]
          : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        dailyStats.push({ date: label, revenue: s.revenue, orders: s.orders });
      }
    } else {
      const step = Math.ceil(daysDiff / 30) * 7;
      for (let offset = 0; offset < daysDiff && dailyStats.length < 30; offset += step) {
        const wStart = new Date(fromDate); wStart.setDate(wStart.getDate() + offset); wStart.setHours(0, 0, 0, 0);
        const wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + step);
        let rev = 0, orders = 0;
        for (const [k, v] of Object.entries(dailyStatsMap)) {
          const kd = new Date(Number(k));
          if (kd >= wStart && kd < wEnd) { rev += v.revenue; orders += v.orders; }
        }
        dailyStats.push({ date: wStart.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), revenue: rev, orders });
      }
    }

    const monthlyAverageOrderValue = monthlyOrders > 0 ? monthlyRevenue / monthlyOrders : 0;
    const lastMonthAverageOrderValue = lastMonthOrders > 0 ? lastMonthRevenue / lastMonthOrders : 0;
    const revenueChange = lastMonthRevenue > 0 ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : (monthlyRevenue > 0 ? 100 : 0);
    const ordersChange = lastMonthOrders > 0 ? ((monthlyOrders - lastMonthOrders) / lastMonthOrders) * 100 : (monthlyOrders > 0 ? 100 : 0);
    const averageOrderValueChange = lastMonthAverageOrderValue > 0 ? ((monthlyAverageOrderValue - lastMonthAverageOrderValue) / lastMonthAverageOrderValue) * 100 : (monthlyAverageOrderValue > 0 ? 100 : 0);

    res.json({
      totalRevenue, totalOrders,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      monthlyRevenue, monthlyOrders, monthlyAverageOrderValue,
      lastMonthRevenue, lastMonthOrders, lastMonthAverageOrderValue,
      revenueChange: Math.round(revenueChange * 10) / 10,
      ordersChange: Math.round(ordersChange * 10) / 10,
      averageOrderValueChange: Math.round(averageOrderValueChange * 10) / 10,
      dailyStats, collectionStats, categoryStats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des stats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function insertPaymentStat(order) {
  try {
    if (!dbReady) {
      console.error('❌ [PAYMENT_STATS] DB non initialisée');
      return;
    }
    const existing = await queryOne('SELECT id FROM payment_stats WHERE order_id = ?', [order.id]);
    if (existing) return;

    const productMap = await getProductMapByIds((order.items || []).map(i => i.productId));

    const date = order.paymentInfo?.paidAt || order.updatedAt || order.createdAt || new Date();
    const totalAmount = Number(order.total) || 0;
    const items = (order.items || []).map(item => {
      const product = productMap[item.productId];
      const collection = product?.collection || 'Autre';
      const category = product?.category || 'Autre';
      const quantity = item.quantity || 1;
      const price = item.price || 0;
      const itemTotal = price * quantity;
      return { productId: item.productId, collection, category, quantity, price, itemTotal };
    });

    const statId = randomUUID();
    await transaction(async (conn) => {
      await conn.query(
        'INSERT INTO payment_stats (id, order_id, date, total_amount) VALUES (?, ?, ?, ?)',
        [statId, order.id, new Date(date), totalAmount]
      );
      for (const item of items) {
        await conn.query(
          'INSERT INTO payment_stat_items (payment_stat_id, product_id, `collection`, category, quantity, price, item_total) '
          + 'VALUES (?, ?, ?, ?, ?, ?, ?)',
          [statId, item.productId, item.collection, item.category, item.quantity, item.price, item.itemTotal]
        );
      }
    });
    console.log('✅ [PAYMENT_STATS] Enregistrement ajouté pour commande', order.id);
  } catch (error) {
    // La contrainte UNIQUE absorbe les doubles appels concurrents (statut « paid »
    // posé par l'admin pendant que le webhook Stripe enregistre le paiement).
    if (error.code === 'ER_DUP_ENTRY') return;
    console.error('Erreur lors de l\'insertion payment_stats:', error);
  }
}

function generatePromoCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function validatePromoCodeInput(data) {
  const errors = [];
  
  if (data.name && typeof data.name !== 'string') {
    errors.push('Le nom doit être une chaîne de caractères');
  }
  if (data.name && (data.name.length < 2 || data.name.length > 100)) {
    errors.push('Le nom doit contenir entre 2 et 100 caractères');
  }
  
  if (data.code && typeof data.code !== 'string') {
    errors.push('Le code doit être une chaîne de caractères');
  }
  if (data.code && (!/^[A-Z0-9]{3,50}$/.test(data.code))) {
    errors.push('Le code doit contenir uniquement des lettres majuscules et chiffres (3-50 caractères)');
  }
  
  if (typeof data.maxUses !== 'number' || data.maxUses < 1 || data.maxUses > 1000000) {
    errors.push('Le nombre d\'utilisations max doit être un nombre entre 1 et 1000000');
  }
  
  if (data.discountType !== 'percentage' && data.discountType !== 'fixed') {
    errors.push('Le type de réduction doit être "percentage" ou "fixed"');
  }
  
  if (typeof data.discountValue !== 'number' || data.discountValue <= 0) {
    errors.push('La valeur de réduction doit être un nombre positif');
  }
  
  if (data.discountType === 'percentage' && data.discountValue > 100) {
    errors.push('Le pourcentage de réduction ne peut pas dépasser 100%');
  }
  
  if (data.discountType === 'fixed' && data.discountValue > 10000) {
    errors.push('La réduction fixe ne peut pas dépasser 10000€');
  }
  
  if (data.startDate && !(data.startDate instanceof Date) && isNaN(Date.parse(data.startDate))) {
    errors.push('La date de début est invalide');
  }
  
  if (data.endDate && !(data.endDate instanceof Date) && isNaN(Date.parse(data.endDate))) {
    errors.push('La date de fin est invalide');
  }
  
  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (end <= start) {
      errors.push('La date de fin doit être postérieure à la date de début');
    }
  }
  
  return errors;
}

app.get('/api/promo-codes', authenticateAdmin, async (req, res) => {
  try {
    const promoCodes = await query('SELECT * FROM promo_codes ORDER BY created_at DESC, id DESC');
    res.json(promoCodes.map(mapPromoCode));
  } catch (error) {
    console.error('Erreur lors de la récupération des codes promo:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/promo-codes', authenticateAdmin, async (req, res) => {
  try {
    const { name, code, discountType, discountValue, maxUses, startDate, endDate, isActive } = req.body;
    
    const validationErrors = validatePromoCodeInput({
      name,
      code: code || 'TEMP',
      discountType,
      discountValue,
      maxUses,
      startDate,
      endDate
    });
    
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }
    
    let finalCode = code;
    if (!finalCode || finalCode.trim() === '') {
      let attempts = 0;
      do {
        finalCode = generatePromoCode(8);
        const existing = await queryOne('SELECT id FROM promo_codes WHERE code = ?', [finalCode]);
        if (!existing) break;
        attempts++;
        if (attempts > 10) {
          return res.status(500).json({ error: 'Impossible de générer un code unique' });
        }
      } while (true);
    } else {
      finalCode = finalCode.toUpperCase().trim();
      const existing = await queryOne('SELECT id FROM promo_codes WHERE code = ?', [finalCode]);
      if (existing) {
        return res.status(409).json({ error: 'Ce code promo existe déjà' });
      }
    }
    
    const id = randomUUID();
    try {
      await query(
        'INSERT INTO promo_codes (id, name, code, discount_type, discount_value, max_uses, current_uses, is_active, start_date, end_date) '
        + 'VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
        [
          id,
          name && name.trim() ? name.trim().slice(0, 100) : null,
          finalCode,
          discountType,
          parseFloat(discountValue),
          parseInt(maxUses),
          isActive !== false ? 1 : 0,
          startDate ? new Date(startDate) : null,
          endDate ? new Date(endDate) : null,
        ]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Ce code promo existe déjà' });
      }
      throw err;
    }

    const created = await queryOne('SELECT * FROM promo_codes WHERE id = ?', [id]);
    res.status(201).json({
      message: 'Code promo créé avec succès',
      promoCode: mapPromoCode(created)
    });
  } catch (error) {
    console.error('Erreur lors de la création du code promo:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/promo-codes/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, discountType, discountValue, maxUses, startDate, endDate, isActive } = req.body;
    
    const existingCode = await queryOne('SELECT * FROM promo_codes WHERE id = ?', [id]);
    if (!existingCode) {
      return res.status(404).json({ error: 'Code promo non trouvé' });
    }

    const updates = [];
    const values = [];
    let newStartDate;
    let newEndDate;
    let newDiscountType;
    
    if (name !== undefined) {
      if (name === null || name === '') {
        updates.push('name = ?'); values.push(null);
      } else if (typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100) {
        updates.push('name = ?'); values.push(name.trim());
      } else {
        return res.status(400).json({ error: 'Le nom doit contenir entre 2 et 100 caractères' });
      }
    }
    
    if (code !== undefined && code !== existingCode.code) {
      const newCode = code.toUpperCase().trim();
      if (!/^[A-Z0-9]{3,50}$/.test(newCode)) {
        return res.status(400).json({ error: 'Le code doit contenir uniquement des lettres majuscules et chiffres (3-50 caractères)' });
      }
      const codeExists = await queryOne('SELECT id FROM promo_codes WHERE code = ? AND id <> ?', [newCode, id]);
      if (codeExists) {
        return res.status(409).json({ error: 'Ce code promo existe déjà' });
      }
      updates.push('code = ?'); values.push(newCode);
    }
    
    if (discountType !== undefined) {
      if (discountType !== 'percentage' && discountType !== 'fixed') {
        return res.status(400).json({ error: 'Le type de réduction doit être "percentage" ou "fixed"' });
      }
      newDiscountType = discountType;
      updates.push('discount_type = ?'); values.push(discountType);
    }
    
    if (discountValue !== undefined) {
      const value = parseFloat(discountValue);
      if (isNaN(value) || value <= 0) {
        return res.status(400).json({ error: 'La valeur de réduction doit être un nombre positif' });
      }
      const type = newDiscountType || existingCode.discount_type;
      if (type === 'percentage' && value > 100) {
        return res.status(400).json({ error: 'Le pourcentage de réduction ne peut pas dépasser 100%' });
      }
      if (type === 'fixed' && value > 10000) {
        return res.status(400).json({ error: 'La réduction fixe ne peut pas dépasser 10000€' });
      }
      updates.push('discount_value = ?'); values.push(value);
    }
    
    if (maxUses !== undefined) {
      const uses = parseInt(maxUses);
      if (isNaN(uses) || uses < 1 || uses > 1000000) {
        return res.status(400).json({ error: 'Le nombre d\'utilisations max doit être un nombre entre 1 et 1000000' });
      }
      if (uses < existingCode.current_uses) {
        return res.status(400).json({ error: 'Le nombre d\'utilisations max ne peut pas être inférieur au nombre d\'utilisations actuelles' });
      }
      updates.push('max_uses = ?'); values.push(uses);
    }
    
    if (startDate !== undefined) {
      newStartDate = startDate ? new Date(startDate) : null;
      updates.push('start_date = ?'); values.push(newStartDate);
    }
    
    if (endDate !== undefined) {
      newEndDate = endDate ? new Date(endDate) : null;
      updates.push('end_date = ?'); values.push(newEndDate);
    }
    
    if (isActive !== undefined) {
      updates.push('is_active = ?'); values.push(isActive === true ? 1 : 0);
    }
    
    const finalStartDate = startDate !== undefined ? newStartDate : existingCode.start_date;
    const finalEndDate = endDate !== undefined ? newEndDate : existingCode.end_date;
    
    if (finalStartDate && finalEndDate) {
      const start = new Date(finalStartDate);
      const end = new Date(finalEndDate);
      if (end <= start) {
        return res.status(400).json({ error: 'La date de fin doit être postérieure à la date de début' });
      }
    }
    
    updates.push('updated_at = NOW(3)');
    values.push(id);
    await query(`UPDATE promo_codes SET ${updates.join(', ')} WHERE id = ?`, values);
    
    const updatedCode = await queryOne('SELECT * FROM promo_codes WHERE id = ?', [id]);
    
    res.json({
      message: 'Code promo mis à jour avec succès',
      promoCode: mapPromoCode(updatedCode)
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du code promo:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/promo-codes/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query('DELETE FROM promo_codes WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Code promo non trouvé' });
    }
    
    res.json({ message: 'Code promo supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du code promo:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/promo-codes/validate', authenticateToken, async (req, res) => {
  try {
    const { code, total } = req.body;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Code promo requis' });
    }
    
    if (total !== undefined && (typeof total !== 'number' || total <= 0)) {
      return res.status(400).json({ error: 'Le total doit être un nombre positif' });
    }
    
    const row = await queryOne('SELECT * FROM promo_codes WHERE code = ?', [code.toUpperCase().trim()]);
    
    if (!row) {
      return res.status(404).json({ error: 'Code promo invalide' });
    }
    const promoCode = mapPromoCode(row);
    
    if (promoCode.isActive === false) {
      return res.status(400).json({ error: 'Ce code promo est désactivé' });
    }
    
    if (promoCode.currentUses >= promoCode.maxUses) {
      return res.status(400).json({ error: 'Ce code promo a atteint sa limite d\'utilisations' });
    }
    
    const now = new Date();
    if (promoCode.startDate && new Date(promoCode.startDate) > now) {
      return res.status(400).json({ error: 'Ce code promo n\'est pas encore valide' });
    }
    
    if (promoCode.endDate && new Date(promoCode.endDate) < now) {
      return res.status(400).json({ error: 'Ce code promo a expiré' });
    }
    
    let discountAmount = 0;
    if (total !== undefined) {
      if (promoCode.discountType === 'percentage') {
        discountAmount = (total * promoCode.discountValue) / 100;
      } else {
        discountAmount = Math.min(promoCode.discountValue, total);
      }
    }
    
    res.json({
      valid: true,
      code: promoCode.code,
      name: promoCode.name,
      discountType: promoCode.discountType,
      discountValue: promoCode.discountValue,
      discountAmount: total !== undefined ? parseFloat(discountAmount.toFixed(2)) : null,
      finalTotal: total !== undefined ? parseFloat((total - discountAmount).toFixed(2)) : null
    });
  } catch (error) {
    console.error('Erreur lors de la validation du code promo:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Fragments SET pour écraser l'adresse de livraison d'une commande. */
function shippingAddressUpdate(ship) {
  const columns = {
    ship_first_name: ship.firstName,
    ship_last_name: ship.lastName,
    ship_email: ship.email,
    ship_phone: ship.phone,
    ship_address: ship.address,
    ship_city: ship.city,
    ship_postal_code: ship.postalCode,
    ship_country: ship.country,
  };
  return {
    updates: Object.keys(columns).map(c => `${c} = ?`),
    values: Object.values(columns).map(v => (v === undefined ? null : v)),
  };
}

app.post('/api/orders/:id/create-payment-intent', authenticateToken, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe non configuré. Ajoutez STRIPE_SECRET_KEY dans Backend/.env (voir STRIPE.md).' });
  }
  try {
    const order = await queryOne('SELECT id, user_id, status, total FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Commande non trouvée' });
    if (order.user_id !== req.user.userId) return res.status(403).json({ error: 'Non autorisé' });
    if (order.status !== 'validated') return res.status(400).json({ error: 'La commande doit être validée avant le paiement' });
    const amountCents = Math.round(Number(order.total) * 100);
    if (amountCents < 50) return res.status(400).json({ error: 'Montant minimum 0,50 €' });
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      metadata: { orderId: String(order.id) },
      automatic_payment_methods: { enabled: true }
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Erreur create-payment-intent:', err);
    res.status(500).json({ error: err.message || 'Erreur Stripe' });
  }
});

app.post('/api/orders/:id/payment', authenticateToken, async (req, res) => {
  const orderIdParam = req.params.id;
  console.log('[PAYMENT] POST /api/orders/:id/payment', orderIdParam, 'paymentIntentId:', req.body?.paymentIntentId ? 'present' : 'absent');
  try {
    const { paymentMethod, cardNumber, expiryDate, cvv, cardholderName, shippingAddress, promoCode, paymentIntentId } = req.body;
    const order = await findOrderById(orderIdParam);
    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    if (order.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    if (order.status === 'paid') {
      return res.json({ message: 'Paiement déjà enregistré', status: 'paid' });
    }
    if (order.status !== 'validated') {
      return res.status(400).json({ error: 'La commande doit être validée avant le paiement' });
    }

    if (paymentIntentId && stripe) {
      let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const maxRetries = 3;
      const retryDelayMs = 2000;
      for (let attempt = 0; attempt <= maxRetries && paymentIntent.status !== 'succeeded'; attempt++) {
        if (attempt > 0) {
          console.log('[PAYMENT] Retry', attempt, 'status was', paymentIntent.status);
          await new Promise(r => setTimeout(r, retryDelayMs));
          paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        }
        console.log('[PAYMENT] PaymentIntent status:', paymentIntent.status, 'id:', paymentIntentId);
        if (paymentIntent.status === 'succeeded') break;
        const canRetry = ['processing', 'requires_action', 'requires_payment_method'].includes(paymentIntent.status);
        if (!canRetry) break;
      }
      if (paymentIntent.status !== 'succeeded') {
        const msg = paymentIntent.status === 'requires_action'
          ? 'Veuillez terminer l\'authentification (3D Secure) puis réessayer.'
          : paymentIntent.status === 'requires_payment_method'
            ? 'Paiement annulé ou refusé. Vérifiez votre carte et réessayez.'
            : paymentIntent.status === 'processing'
              ? 'Paiement en cours. Rechargez la page dans quelques secondes ou consultez vos commandes.'
              : 'Paiement non finalisé. Veuillez retourner sur la page paiement et cliquer sur « Payer » en validant jusqu\'au bout.';
        return res.status(400).json({ error: msg });
      }
      const updates = ["status = 'paid'", 'payment_info = ?', 'updated_at = NOW(3)'];
      const values = [toJson({ method: 'stripe', paymentIntentId, paidAt: new Date() })];
      if (shippingAddress) {
        const ship = shippingAddressUpdate(shippingAddress);
        updates.push(...ship.updates);
        values.push(...ship.values);
      }
      values.push(req.params.id);
      await query(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, values);

      const updatedOrder = await findOrderById(req.params.id);
      await insertPaymentStat(updatedOrder);

      const { orderData, clientEmail } = await buildOrderEmailData(updatedOrder, { withContact: true });
      orderData.paymentMethod = 'Stripe';
      try {
        // Facture envoyée au client (email livraison prioritaire, sinon email compte)
        if (clientEmail) {
          await sendOrderConfirmationEmail(clientEmail, orderData);
          await sendInvoiceEmail(clientEmail, orderData);
        }
        await sendNewOrderNotificationEmail(orderData);
      } catch (emailErr) {
        console.error('Erreur envoi emails après paiement:', emailErr);
      }
      return res.json({ message: 'Paiement enregistré', status: 'paid' });
    }

    let finalTotal = order.total;
    let appliedPromoCode = null;
    
    if (promoCode && typeof promoCode === 'string' && promoCode.trim() !== '') {
      const promo = await queryOne('SELECT * FROM promo_codes WHERE code = ?', [promoCode.toUpperCase().trim()]);
      
      if (promo && toBool(promo.is_active) && promo.current_uses < promo.max_uses) {
        const now = new Date();
        const isValidDate = (!promo.start_date || new Date(promo.start_date) <= now) && 
                           (!promo.end_date || new Date(promo.end_date) >= now);
        
        if (isValidDate) {
          const discountValue = toNum(promo.discount_value);
          let discountAmount = 0;
          if (promo.discount_type === 'percentage') {
            discountAmount = (order.total * discountValue) / 100;
          } else {
            discountAmount = Math.min(discountValue, order.total);
          }
          
          finalTotal = Math.max(0, order.total - discountAmount);
          appliedPromoCode = {
            code: promo.code,
            name: promo.name,
            discountType: promo.discount_type,
            discountValue,
            discountAmount: parseFloat(discountAmount.toFixed(2))
          };
          
          await query(
            'UPDATE promo_codes SET current_uses = current_uses + 1, updated_at = NOW(3) WHERE id = ?',
            [promo.id]
          );
        }
      }
    }
    
    const updates = ["status = 'paid'", 'payment_info = ?', 'total = ?', 'original_total = ?', 'promo_code = ?', 'updated_at = NOW(3)'];
    const values = [
      toJson({
        method: paymentMethod,
        cardNumber: cardNumber ? cardNumber.slice(-4) : null,
        paidAt: new Date()
      }),
      parseFloat(finalTotal.toFixed(2)),
      order.total,
      toJson(appliedPromoCode),
    ];
    if (shippingAddress) {
      const ship = shippingAddressUpdate(shippingAddress);
      updates.push(...ship.updates);
      values.push(...ship.values);
    }
    values.push(req.params.id);
    await query(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, values);

    const updatedOrder = await findOrderById(req.params.id);
    await insertPaymentStat(updatedOrder);

    res.json({ message: 'Paiement enregistré', status: 'paid' });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du paiement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.use((err, req, res, _next) => {
  // pino-http attache déjà req.log, on l'utilise pour conserver le requestId
  (req.log || logger).error({ err, method: req.method, url: req.originalUrl }, '[EXPRESS] Erreur non gérée');
  if (!res.headersSent) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

logger.info({ port: PORT }, '[BOOT] Écoute');
try {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info({
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      api: `http://0.0.0.0:${PORT}/api`,
      health: `http://0.0.0.0:${PORT}/api/health`,
      metrics: `http://0.0.0.0:${PORT}/api/metrics`,
    }, '🚀 Serveur démarré');
    connectToDatabase();
  });
} catch (err) {
  logger.fatal({ err }, '[BOOT] Erreur au démarrage');
  process.exit(1);
}

process.on('SIGTERM', async () => {
  await closePool();
  logger.info('Pool MariaDB fermé');
  process.exit(0);
});
