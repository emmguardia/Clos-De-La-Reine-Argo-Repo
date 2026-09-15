import mariadb from 'mariadb';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Pool MariaDB
//
// timezone 'Z' : la session SQL est forcée en UTC (SET time_zone='+00:00') et
// le driver convertit les DATETIME en Date JS UTC. Les dates restent donc
// identiques à ce que stockait MongoDB, quel que soit le fuseau du serveur.
//
// decimalAsNumber / bigIntAsNumber : sans ces options le driver renvoie les
// DECIMAL en string et les COUNT(*) en BigInt, que JSON.stringify refuse de
// sérialiser. L'API doit continuer à répondre des nombres JSON.
// ---------------------------------------------------------------------------
let pool = null;

export function createPool() {
  if (pool) return pool;
  pool = mariadb.createPool({
    host: process.env.MARIADB_HOST || 'localhost',
    port: parseInt(process.env.MARIADB_PORT || '3306', 10),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE || 'clos_de_la_reine',
    connectionLimit: parseInt(process.env.MARIADB_POOL_SIZE || '10', 10),
    connectTimeout: 10000,
    acquireTimeout: 30000,
    idleTimeout: 180,
    charset: 'utf8mb4',
    timezone: 'Z',
    decimalAsNumber: true,
    bigIntAsNumber: true,
    permitLocalInfile: false,
    // SSL seulement si le certificat CA est fourni (base64) — le MariaDB
    // interne du cluster tourne sans TLS.
    ssl: process.env.MARIADB_CA_CERT
      ? {
          rejectUnauthorized: process.env.MARIADB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ca: Buffer.from(process.env.MARIADB_CA_CERT, 'base64').toString('utf8'),
        }
      : undefined,
  });
  return pool;
}

export function getPool() {
  return pool;
}

/** Requête simple. Le pool gère l'acquisition et la libération de la connexion. */
export async function query(sql, params = []) {
  if (!pool) throw new Error('Pool MariaDB non initialisé');
  return pool.query(sql, params);
}

/** Première ligne d'un SELECT, ou null. */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Transaction : commit si le callback résout, rollback s'il rejette.
 * Le callback reçoit la connexion — toutes ses requêtes doivent passer par
 * `conn.query`, sinon elles sortiraient de la transaction.
 */
export async function transaction(callback) {
  if (!pool) throw new Error('Pool MariaDB non initialisé');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, '[DB] Rollback impossible');
    }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Applique src/config/schema.sql (CREATE TABLE IF NOT EXISTS uniquement).
 * Joué à chaque démarrage, comme les createIndex() de l'ancien connect Mongo :
 * une base vide devient utilisable sans étape manuelle, une base déjà peuplée
 * n'est pas touchée.
 */
export async function ensureSchema() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await query(statement);
  }
  logger.info({ tables: statements.length }, '[DB] Schéma vérifié');
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers de conversion SQL → JSON
//
// Les colonnes « documents » (tableaux d'images, contre-proposition, infos de
// paiement) sont stockées en LONGTEXT JSON : le driver MariaDB les renvoie en
// chaîne, jamais en objet, contrairement au JSON natif de MySQL 8.
// ---------------------------------------------------------------------------

export function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function toJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/** TINYINT(1) → booléen JS. */
export function toBool(value) {
  return value === 1 || value === true || value === '1';
}

/** DECIMAL/NULL → nombre JS ou null (jamais NaN). */
export function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Échappe les jokers LIKE d'une saisie utilisateur.
 * Remplace escapeMongoRegex() : ici l'injection n'est plus possible (requêtes
 * préparées), mais un `%` saisi ne doit pas devenir un joker.
 */
export function escapeLike(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\\%_]/g, '\\$&').slice(0, 200);
}

/** Construit la liste de placeholders d'un IN (...) — le driver n'expanse pas les tableaux. */
export function placeholders(count) {
  return Array.from({ length: count }, () => '?').join(',');
}
