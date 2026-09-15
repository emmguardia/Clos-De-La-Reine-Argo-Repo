/**
 * node scripts/init-db.js
 *
 * Crée les tables manquantes à partir de src/config/schema.sql.
 * Le backend fait déjà cette vérification au démarrage : ce script sert à
 * préparer une base à la main (nouvelle instance, poste de dev, bascule prod).
 *
 * Variables attendues : MARIADB_HOST, MARIADB_PORT, MARIADB_USER,
 * MARIADB_PASSWORD, MARIADB_DATABASE.
 */
import { createPool, ensureSchema, closePool } from '../src/config/database.js';

createPool();
try {
  await ensureSchema();
  console.log('✅ Schéma appliqué sur', process.env.MARIADB_DATABASE);
} catch (err) {
  console.error('❌ Échec de l\'initialisation :', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
