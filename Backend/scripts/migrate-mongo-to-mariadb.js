/**
 * node scripts/migrate-mongo-to-mariadb.js [--dry-run | --sql-out <fichier>]
 *
 * Reprend les données de MongoDB vers MariaDB, une fois pour toutes, au moment
 * de la bascule. Trois modes :
 *
 *   (défaut)            écrit directement dans MariaDB (les deux serveurs
 *                       doivent être joignables depuis la même machine)
 *   --dry-run           ne touche à rien, compte seulement les lignes
 *   --sql-out <fichier> n'ouvre AUCUNE connexion MariaDB : produit un dump .sql
 *                       autonome (schéma + données) à charger ensuite avec
 *                       `mariadb < fichier`. C'est le mode à utiliser quand la
 *                       base cible vit sur un autre cluster que Mongo.
 *
 * Le résultat est idempotent dans les deux cas (REPLACE INTO) : la migration
 * peut être jouée à froid puis rejouée juste après l'arrêt de l'ancien backend.
 *
 * Les _id ObjectId sont repris tels quels comme identifiants VARCHAR(36) :
 * aucune URL, aucune session et aucune référence croisée n'est cassée.
 *
 * Source   : MONGODB_URI (ou MONGODB_HOST/USER/PASSWORD/DB)
 * Cible    : MARIADB_HOST/PORT/USER/PASSWORD/DATABASE, ou un fichier .sql
 */
import { MongoClient } from 'mongodb';
import { createWriteStream, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Le driver MariaDB n'est chargé qu'en mode écriture directe. En --sql-out,
// l'extraction ne dépend donc que du paquet `mongodb` : le script peut tourner
// sur le serveur qui héberge Mongo sans y installer quoi que ce soit d'autre.
let mariadb = null;
async function db_() {
  if (!mariadb) mariadb = await import('../src/config/database.js');
  return mariadb;
}

/** Sérialisation des colonnes « document » (tableaux, contre-proposition…). */
function toJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/** schema.sql, depuis l'arborescence du repo ou posé à côté du script. */
function readSchema() {
  const candidates = [
    join(__dirname, '..', 'src', 'config', 'schema.sql'),
    join(__dirname, 'schema.sql'),
  ];
  const found = candidates.find((f) => existsSync(f));
  if (!found) {
    throw new Error(`schema.sql introuvable (cherché dans : ${candidates.join(', ')})`);
  }
  return readFileSync(found, 'utf8');
}

const DRY_RUN = process.argv.includes('--dry-run');
const sqlOutIndex = process.argv.indexOf('--sql-out');
const SQL_OUT = sqlOutIndex !== -1 ? process.argv[sqlOutIndex + 1] : null;
if (sqlOutIndex !== -1 && !SQL_OUT) {
  console.error('--sql-out attend un chemin de fichier');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_USER = process.env.MONGODB_USER;
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD;
const MONGODB_DB = process.env.MONGODB_DB || 'clos_de_la_reine_db';
const MONGODB_HOST = process.env.MONGODB_HOST || 'localhost';

const uri = MONGODB_URI
  || `mongodb://${MONGODB_USER}:${encodeURIComponent(MONGODB_PASSWORD)}@${MONGODB_HOST}:27017/${MONGODB_DB}?authSource=${MONGODB_DB}`;

const counts = {};

function id(value) {
  return value === null || value === undefined ? null : String(value);
}

function date(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value ? 1 : 0;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function arr(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

// ---------------------------------------------------------------------------
// Génération du dump .sql
//
// Échappement identique à celui de mysqldump. Il n'est correct que si le mode
// NO_BACKSLASH_ESCAPES est inactif et la connexion en utf8mb4 : le préambule du
// dump force les deux, puis les restaure à la fin.
// ---------------------------------------------------------------------------
const SQL_ESCAPES = {
  '\0': '\\0', '\b': '\\b', '\t': '\\t', '\n': '\\n', '\r': '\\r',
  '\x1a': '\\Z', '\\': '\\\\', "'": "\\'", '"': '\\"',
};

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) {
    // DATETIME(3) en UTC — le backend force SET time_zone='+00:00'
    return `'${value.toISOString().slice(0, 23).replace('T', ' ')}'`;
  }
  return `'${String(value).replace(/[\0\b\t\n\r\x1a\\'"]/g, (c) => SQL_ESCAPES[c])}'`;
}

let sqlStream = null;
function writeSql(line) {
  sqlStream.write(line + '\n');
}

async function insert(table, rows) {
  counts[table] = rows.length;
  if (DRY_RUN || rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  // REPLACE INTO : rejouer la migration écrase la ligne au lieu d'échouer.
  const head = `REPLACE INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES `;

  if (SQL_OUT) {
    writeSql(`\n-- ${table} (${rows.length})`);
    // Une instruction par ligne : les colonnes d'images sont des LONGTEXT
    // base64 de plusieurs Mo, un INSERT groupé dépasserait max_allowed_packet.
    for (const row of rows) {
      writeSql(`${head}(${columns.map(c => sqlLiteral(row[c])).join(', ')});`);
    }
    return;
  }

  const { query } = await db_();
  for (const row of rows) {
    await query(`${head}(${columns.map(() => '?').join(', ')})`, columns.map(c => row[c]));
  }
}

/** Purge une table dans le dump comme en direct (tables à AUTO_INCREMENT). */
async function truncate(table) {
  if (DRY_RUN) return;
  if (SQL_OUT) return writeSql(`DELETE FROM \`${table}\`;`);
  const { query } = await db_();
  await query(`DELETE FROM \`${table}\``);
}

const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
await mongo.connect();
const db = mongo.db(MONGODB_DB);
console.log('📖 Lecture de MongoDB :', MONGODB_DB);

if (SQL_OUT) {
  sqlStream = createWriteStream(SQL_OUT, { encoding: 'utf8' });
  writeSql('-- Clos de la Reine — export MongoDB → MariaDB');
  writeSql(`-- Généré le ${new Date().toISOString()}`);
  writeSql('--');
  writeSql('-- Chargement :');
  writeSql('--   mariadb --max-allowed-packet=256M -h <hôte> -u <user> -p <base> < ce-fichier.sql');
  writeSql('');
  writeSql('SET @OLD_SQL_MODE = @@SQL_MODE;');
  writeSql("SET SQL_MODE = '';");
  writeSql('SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;');
  writeSql('SET FOREIGN_KEY_CHECKS = 0;');
  writeSql("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;");
  writeSql("SET time_zone = '+00:00';");
  writeSql('');
  writeSql('-- ── Schéma (identique à src/config/schema.sql) ──');
  writeSql(readSchema());
  console.log('📝 Écriture du dump SQL :', SQL_OUT);
} else {
  const { createPool, ensureSchema } = await db_();
  createPool();
  await ensureSchema();
  console.log('📝 Écriture dans MariaDB :', process.env.MARIADB_DATABASE, DRY_RUN ? '(dry-run)' : '');
}

// ── users ────────────────────────────────────────────────────────────────────
const users = await db.collection('users').find({}).toArray();
await insert('users', users.map(u => ({
  id: id(u._id),
  email: u.email,
  password: u.password,
  first_name: u.firstName || '',
  last_name: u.lastName || '',
  is_active: bool(u.isActive, true),
  last_login: date(u.lastLogin),
  created_at: date(u.createdAt) || new Date(),
  updated_at: date(u.updatedAt),
})));

// ── products ─────────────────────────────────────────────────────────────────
const products = await db.collection('products').find({}).toArray();
await insert('products', products.map(p => ({
  id: p.id,
  name: p.name,
  price: num(p.price) ?? 0,
  image: p.image || '',
  second_image: p.secondImage || null,
  additional_images: toJson(arr(p.additionalImages)),
  category: p.category,
  collection: p.collection,
  // color était tantôt une chaîne, tantôt un tableau : on normalise en tableau.
  color: toJson(arr(p.color)),
  sizes: toJson(arr(p.sizes)),
  surcharge_1m20: num(p.surcharge1m20),
  surcharge_sur_mesure: num(p.surchargeSurMesure),
  is_new: bool(p.isNew),
  disponible: bool(p.disponible, true),
  brief_description: p.briefDescription || '',
  created_at: date(p.createdAt) || new Date(),
  updated_at: date(p.updatedAt) || date(p.createdAt) || new Date(),
})));

// ── collections ──────────────────────────────────────────────────────────────
const collections = await db.collection('collections').find({}).toArray();
await insert('collections', collections.map(c => ({
  id: id(c._id),
  name: c.name,
  created_at: date(c.createdAt) || new Date(),
  updated_at: date(c.updatedAt) || new Date(),
})));

// ── gallery ──────────────────────────────────────────────────────────────────
const gallery = await db.collection('gallery').find({}).toArray();
await insert('gallery', gallery.map(g => ({
  id: id(g._id),
  name: g.name,
  data: g.data,
  type: g.type === 'client' ? 'client' : 'professional',
  uploaded_by: g.uploadedBy || 'admin',
  created_at: date(g.createdAt) || new Date(),
  updated_at: date(g.updatedAt) || new Date(),
})));

// ── images ───────────────────────────────────────────────────────────────────
const images = await db.collection('images').find({}).toArray();
await insert('images', images.map(i => ({
  id: id(i._id),
  name: i.name,
  data: i.data,
  uploaded_by: i.uploadedBy || 'admin',
  type: i.type || 'product',
  uploaded_at: date(i.uploadedAt) || new Date(),
})));

// ── faq ──────────────────────────────────────────────────────────────────────
// L'ancienne API triait en mémoire par `sortOrder ?? 999999` : les entrées sans
// sortOrder passaient en dernier. On rejoue ce tri puis on renumérote de 0 à n-1,
// pour conserver l'ordre d'affichage exact sans collision de rang.
const faqs = await db.collection('faq').find({}).toArray();
faqs.sort((a, b) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999));
await insert('faq', faqs.map((f, index) => ({
  id: id(f._id),
  category: f.category,
  question: f.question,
  answer: f.answer,
  display_order: f.order || 0,
  category_order: f.categoryOrder || 0,
  sort_order: index,
  created_at: date(f.createdAt) || new Date(),
  updated_at: date(f.updatedAt) || new Date(),
})));

// ── settings ─────────────────────────────────────────────────────────────────
const pricing = await db.collection('settings').findOne({ _id: 'pricing' });
await insert('settings', pricing ? [{
  id: 'pricing',
  surmesurecollier: num(pricing.surmesurecollier),
  surmesureharnais: num(pricing.surmesureharnais),
  laisse_1m20: num(pricing.laisse1m20),
  updated_at: date(pricing.updatedAt) || new Date(),
}] : []);

// ── carts → cart_items ───────────────────────────────────────────────────────
const carts = await db.collection('carts').find({}).toArray();
const knownUserIds = new Set(users.map(u => id(u._id)));
const cartItems = [];
for (const cart of carts) {
  // Clé étrangère sur users : on ignore les paniers d'un compte supprimé.
  if (!knownUserIds.has(id(cart.userId))) continue;
  const seen = new Set();
  for (const item of cart.items || []) {
    const size = item.size ? String(item.size).slice(0, 20) : '';
    const key = `${item.productId}|${size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cartItems.push({
      user_id: id(cart.userId),
      product_id: item.productId,
      size,
      quantity: item.quantity || 1,
      added_at: date(cart.updatedAt) || new Date(),
      updated_at: date(cart.updatedAt) || new Date(),
    });
  }
}
await insert('cart_items', cartItems);

// ── favorites ────────────────────────────────────────────────────────────────
const favorites = await db.collection('favorites').find({}).toArray();
const favoriteRows = [];
for (const fav of favorites) {
  if (!knownUserIds.has(id(fav.userId))) continue;
  for (const productId of new Set(fav.productIds || [])) {
    favoriteRows.push({
      user_id: id(fav.userId),
      product_id: productId,
      created_at: date(fav.updatedAt) || new Date(),
    });
  }
}
await insert('favorites', favoriteRows);

// ── orders + order_items ─────────────────────────────────────────────────────
const orders = await db.collection('orders').find({}).toArray();
const orderItems = [];
await insert('orders', orders.map(o => {
  const ship = o.shippingAddress || {};
  const dog = o.dogInfo || {};
  (o.items || []).forEach((item, position) => {
    orderItems.push({
      order_id: id(o._id),
      product_id: item.productId,
      quantity: item.quantity || 1,
      price: num(item.price) ?? 0,
      size: item.size || null,
      position,
    });
  });
  return {
    id: id(o._id),
    order_number: o.orderNumber || null,
    user_id: id(o.userId),
    ship_first_name: ship.firstName ?? null,
    ship_last_name: ship.lastName ?? null,
    ship_email: ship.email ?? null,
    ship_phone: ship.phone ?? null,
    ship_address: ship.address ?? null,
    ship_city: ship.city ?? null,
    ship_postal_code: ship.postalCode ?? null,
    ship_country: ship.country ?? null,
    dog_breed: dog.breed ?? null,
    dog_age: dog.age ?? null,
    dog_tour_de_cou: dog.tourDeCou ?? null,
    dog_tour_de_taille: dog.tourDeTaille ?? null,
    dog_sur_mesure_collier: bool(dog.surMesureCollier),
    dog_sur_mesure_harnais: bool(dog.surMesureHarnais),
    notes: o.notes || '',
    total: num(o.total) ?? 0,
    original_total: num(o.originalTotal),
    shipping_amount: num(o.shippingAmount),
    fees_amount: num(o.feesAmount),
    promo_code: toJson(o.promoCode ?? null),
    status: o.status || 'pending_validation',
    counter_proposal: toJson(o.counterProposal ?? null),
    payment_info: toJson(o.paymentInfo ?? null),
    rejection_reason: o.rejectionReason ?? null,
    created_at: date(o.createdAt) || new Date(),
    updated_at: date(o.updatedAt) || date(o.createdAt) || new Date(),
  };
}));
// order_items a un AUTO_INCREMENT : on repart de zéro plutôt que d'accumuler
// des doublons si la migration est rejouée.
if (orderItems.length > 0) await truncate('order_items');
await insert('order_items', orderItems);

// ── counters ─────────────────────────────────────────────────────────────────
const counters = await db.collection('counters').find({}).toArray();
await insert('counters', counters.map(c => ({
  name: id(c._id),
  seq: c.seq || 0,
  created_at: date(c.createdAt) || new Date(),
})));

// ── promo_codes ──────────────────────────────────────────────────────────────
const promoCodes = await db.collection('promo_codes').find({}).toArray();
await insert('promo_codes', promoCodes.map(p => ({
  id: id(p._id),
  name: p.name || null,
  code: p.code,
  discount_type: p.discountType,
  discount_value: num(p.discountValue) ?? 0,
  max_uses: p.maxUses || 1,
  current_uses: p.currentUses || 0,
  is_active: bool(p.isActive, true),
  start_date: date(p.startDate),
  end_date: date(p.endDate),
  created_at: date(p.createdAt) || new Date(),
  updated_at: date(p.updatedAt) || new Date(),
})));

// ── payment_stats + payment_stat_items ───────────────────────────────────────
const paymentStats = await db.collection('payment_stats').find({}).toArray();
const statItems = [];
await insert('payment_stats', paymentStats.map(s => {
  for (const item of s.items || []) {
    statItems.push({
      payment_stat_id: id(s._id),
      product_id: item.productId ?? null,
      collection: item.collection || 'Autre',
      category: item.category || 'Autre',
      quantity: item.quantity || 1,
      price: num(item.price) ?? 0,
      item_total: num(item.itemTotal) ?? 0,
    });
  }
  return {
    id: id(s._id),
    order_id: id(s.orderId),
    date: date(s.date) || new Date(),
    total_amount: num(s.totalAmount) ?? 0,
    created_at: date(s.createdAt) || new Date(),
  };
}));
if (statItems.length > 0) await truncate('payment_stat_items');
await insert('payment_stat_items', statItems);

// ── admin_auth ───────────────────────────────────────────────────────────────
const adminAuth = await db.collection('admin_auth').findOne({});
await insert('admin_auth', adminAuth ? [{
  id: 1,
  password_hash: adminAuth.passwordHash,
  last_login: date(adminAuth.lastLogin),
  last_login_ip: adminAuth.lastLoginIp || null,
  created_at: date(adminAuth.createdAt) || new Date(),
}] : []);

// admin_login_attempts et ip_bans ne sont pas repris : données de sécurité
// éphémères (TTL 24 h / durée du ban), sans valeur après la bascule.

if (SQL_OUT) {
  writeSql('');
  writeSql('SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;');
  writeSql('SET SQL_MODE = @OLD_SQL_MODE;');
  await new Promise((resolve, reject) => sqlStream.end((err) => (err ? reject(err) : resolve())));
}

console.log('\n── Résumé ──');
for (const [table, count] of Object.entries(counts)) {
  console.log(`  ${table.padEnd(20)} ${count}`);
}
if (DRY_RUN) console.log('\n🔍 Dry-run : rien n\'a été écrit.');
else if (SQL_OUT) console.log(`\n✅ Dump écrit : ${SQL_OUT}`);
else console.log('\n✅ Migration terminée.');

await mongo.close();
if (!SQL_OUT) await (await db_()).closePool();
