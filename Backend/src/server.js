import express from 'express';
import compression from 'compression';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { sendNewContactNotificationEmail, sendContactConfirmationEmail, sendOrderConfirmationEmail, sendNewOrderNotificationEmail, sendOrderValidatedEmail } from './utils/email.js';
import { sendInvoiceEmail } from './utils/invoice.js';
import Stripe from 'stripe';

console.log('[BOOT] Démarrage du serveur...');

process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err?.message || err, err?.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH] unhandledRejection:', reason, promise);
  process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_USER = process.env.MONGODB_USER;
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD;
const MONGODB_DB = process.env.MONGODB_DB || 'clos_de_la_reine_db';
const MONGODB_HOST = process.env.MONGODB_HOST;
const JWT_SECRET = process.env.JWT_SECRET || 'changez-moi-en-production-avec-une-cle-secrete-tres-longue-et-aleatoire';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
const stripe = STRIPE_SECRET_KEY && STRIPE_SECRET_KEY.startsWith('sk_')
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })
  : null;

app.use(compression());
app.set('trust proxy', 1);
const corsOrigin = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173');
app.use(cors({
  origin: corsOrigin ?? false,
  credentials: !!corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use(express.json({ limit: '50mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '50mb', parameterLimit: 100 }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de tentatives, veuillez réessayer plus tard' },
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
    const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
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

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Trop de requêtes. Veuillez réessayer dans une minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function escapeMongoRegex(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').slice(0, 200);
}

app.use('/api', apiLimiter);

const SALT_ROUNDS = 12;
const ADMIN_JWT_EXPIRATION = '8h';

let client;
let db;

async function getProductMapByIds(productIds) {
  if (!productIds || productIds.length === 0) return {};
  const ids = [...new Set(productIds.filter(Boolean))];
  const products = await db.collection('products').find({ id: { $in: ids } }, { projection: { id: 1, name: 1, collection: 1, category: 1 } }).toArray();
  return Object.fromEntries((products || []).map(p => [p.id, p]));
}

async function connectToDatabase() {
  try {
    const host = MONGODB_HOST || 'localhost';
    const uri = MONGODB_URI || `mongodb://${MONGODB_USER}:${encodeURIComponent(MONGODB_PASSWORD)}@${host}:27017/${MONGODB_DB}?authSource=${MONGODB_DB}`;
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });
    await client.connect();
    db = client.db(MONGODB_DB);
    const productsCol = db.collection('products');
    await productsCol.createIndex({ id: 1 }).catch(() => {});
    await productsCol.createIndex({ category: 1 }).catch(() => {});
    await productsCol.createIndex({ collection: 1 }).catch(() => {});
    await productsCol.createIndex({ isNew: 1 }).catch(() => {});
    console.log('✅ Connecté à MongoDB');
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error);
    setTimeout(connectToDatabase, 5000);
  }
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

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
}

async function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Accès admin requis' });
    }

    const adminAuth = await db.collection('admin_auth').findOne({});
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

app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ stripePublishableKey: STRIPE_PUBLISHABLE_KEY || '' });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/config') return next();
  if (!db) return res.status(503).json({ error: 'Service temporairement indisponible' });
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

    const existingUser = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = {
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      createdAt: new Date(),
      lastLogin: null,
      isActive: true
    };

    const result = await db.collection('users').insertOne(user);
    
    const token = jwt.sign(
      { userId: result.insertedId.toString(), email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Inscription réussie',
      token,
      user: {
        id: result.insertedId.toString(),
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
    const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';

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
    const user = await db.collection('users').findOne({ email: emailLower });
    const elapsedTime = Date.now() - startTime;

    if (!user) {
      const delay = Math.max(1500 - elapsedTime, 500) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    if (!user.isActive) {
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

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );

    const tokenExpiration = rememberMe === true ? '30d' : '1d';
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      JWT_SECRET,
      { expiresIn: tokenExpiration }
    );

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, email, currentPassword, newPassword } = req.body;
    const userId = new ObjectId(req.user.userId);

    const user = await db.collection('users').findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const updateData = {};
    const errors = [];

    if (firstName && firstName.trim().length >= 2) {
      updateData.firstName = firstName.trim();
    } else if (firstName) {
      errors.push('Le prénom doit contenir au moins 2 caractères');
    }

    if (lastName && lastName.trim().length >= 2) {
      updateData.lastName = lastName.trim();
    } else if (lastName) {
      errors.push('Le nom doit contenir au moins 2 caractères');
    }

    if (email && validateEmail(email)) {
      const emailLower = email.toLowerCase().trim();
      if (emailLower !== user.email) {
        const existingUser = await db.collection('users').findOne({ 
          email: emailLower,
          _id: { $ne: userId }
        });
        if (existingUser) {
          errors.push('Cet email est déjà utilisé');
        } else {
          updateData.email = emailLower;
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
          updateData.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Aucune modification à apporter' });
    }

    updateData.updatedAt = new Date();

    await db.collection('users').updateOne(
      { _id: userId },
      { $set: updateData }
    );

    const updatedUser = await db.collection('users').findOne(
      { _id: userId },
      { projection: { password: 0 } }
    );

    res.json({
      message: 'Profil mis à jour avec succès',
      user: {
        id: updatedUser._id.toString(),
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        createdAt: updatedUser.createdAt,
        lastLogin: updatedUser.lastLogin
      }
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/auth/export', authenticateToken, async (req, res) => {
  try {
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const exportData = {
      ...user,
      id: user._id.toString(),
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

app.delete('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Mot de passe requis pour supprimer le compte' });
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    await db.collection('users').deleteOne({ _id: new ObjectId(req.user.userId) });

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
    const collection = (typeof collectionRaw === 'string' && !collectionRaw.includes('$') && !collectionRaw.includes('.')) ? collectionRaw.slice(0, 100) : null;
    const colorRaw = req.query.color;
    const color = (typeof colorRaw === 'string' && !colorRaw.includes('$') && !colorRaw.includes('.')) ? colorRaw.slice(0, 50) : null;
    const isNew = req.query.isNew === '1' || req.query.isNew === 'true';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const includeFilters = req.query.includeFilters === '1' || req.query.includeFilters === 'true';

    let filter = {};
    if (idsParam && typeof idsParam === 'string') {
      const ids = idsParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (ids.length > 0) filter = { id: { $in: ids } };
    } else {
      if (category) filter.category = category;
      if (collection) filter.collection = collection;
      if (color) filter.$or = [{ color: color }, { color: { $in: [color] } }];
      if (isNew) filter.isNew = true;
      if (search) {
        const escaped = escapeMongoRegex(search);
        if (escaped) {
          const searchFilter = { $or: [
            { name: { $regex: escaped, $options: 'i' } },
            { collection: { $regex: escaped, $options: 'i' } }
          ]};
          filter = Object.keys(filter).length > 0 ? { $and: [filter, searchFilter] } : searchFilter;
        }
      }
    }

    const projection = minimal ? { secondImage: 0, additionalImages: 0 } : {};
    const filterForMeta = category ? { category } : {};
    const [products, total, metaProducts] = await Promise.all([
      db.collection('products').find(filter, { projection }).skip(skip).limit(idsParam ? 500 : limit).toArray(),
      idsParam ? Promise.resolve(0) : db.collection('products').countDocuments(filter),
      (includeFilters && page === 1 && !idsParam) ? db.collection('products').find(filterForMeta, { projection: { collection: 1, color: 1 } }).toArray() : Promise.resolve(null)
    ]);

    const formattedProducts = products.map(product => {
      const cat = product.category;
      const sizes = product.sizes?.length ? product.sizes : (cat === 'laisses' ? ['1m', '1m20'] : (cat === 'colliers' || cat === 'harnais') ? ['XS', 'S', 'M', 'L', 'XL'] : []);
      const base = {
        id: product.id || product._id?.toString() || product._id,
        name: product.name,
        price: product.price,
        image: product.image,
        category: product.category,
        collection: product.collection,
        color: product.color,
        sizes,
        surcharge1m20: product.surcharge1m20 ?? null,
        surchargeSurMesure: product.surchargeSurMesure ?? null,
        isNew: product.isNew || false,
        briefDescription: product.briefDescription || undefined
      };
      if (minimal) return base;
      return { ...base, secondImage: product.secondImage, additionalImages: product.additionalImages || [] };
    });

    if (idsParam) {
      res.json(formattedProducts);
    } else {
      const payload = { products: formattedProducts, total };
      if (metaProducts) {
        payload.collections = [...new Set(metaProducts.map(p => p.collection).filter(Boolean))].sort();
        payload.colors = [...new Set(metaProducts.flatMap(p => Array.isArray(p.color) ? p.color : [p.color]).filter(Boolean))].sort();
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
    const filter = category ? { category } : {};
    const products = await db.collection('products').find(filter, { projection: { collection: 1, color: 1 } }).toArray();
    const collections = [...new Set(products.map(p => p.collection).filter(Boolean))].sort();
    const colors = [...new Set(products.flatMap(p => Array.isArray(p.color) ? p.color : [p.color]).filter(Boolean))].sort();
    res.json({ collections, colors });
  } catch (error) {
    console.error('Erreur lors de la récupération des filtres:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/products/ids', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=300');
    const products = await db.collection('products').find({}, { projection: { id: 1, _id: 0 } }).toArray();
    const ids = products.map(p => p.id ?? p._id).filter(Boolean);
    res.json({ ids });
  } catch (error) {
    console.error('Erreur lors de la récupération des IDs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await db.collection('products').findOne({ id: parseInt(req.params.id) });
    if (!product) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    res.json(product);
  } catch (error) {
    console.error('Erreur lors de la récupération du produit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/products', authenticateAdmin, async (req, res) => {
  try {
    const { name, price, image, secondImage, additionalImages, category, collection, color, isNew, briefDescription, surcharge1m20, surchargeSurMesure } = req.body;

    if (!name || !price || !image || !category || !collection) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const maxDoc = await db.collection('products').find({}).sort({ id: -1 }).limit(1).toArray();
    const maxId = maxDoc.length > 0 ? (maxDoc[0].id || 0) : 0;

    const sizes = category === 'laisses' ? ['1m', '1m20'] : (category === 'colliers' || category === 'harnais') ? ['XS', 'S', 'M', 'L', 'XL'] : [];
    const product = {
      id: maxId + 1,
      name,
      price: parseFloat(price),
      image,
      secondImage: secondImage || null,
      additionalImages: additionalImages || [],
      category,
      collection,
      color: Array.isArray(color) ? color : (color ? color.split(',').map(c => c.trim()) : []),
      sizes,
      surcharge1m20: surcharge1m20 !== undefined && surcharge1m20 !== '' && surcharge1m20 !== null ? parseFloat(String(surcharge1m20).replace(',', '.')) : null,
      surchargeSurMesure: surchargeSurMesure !== undefined && surchargeSurMesure !== '' && surchargeSurMesure !== null ? parseFloat(String(surchargeSurMesure).replace(',', '.')) : null,
      isNew: isNew || false,
      briefDescription: briefDescription ? String(briefDescription).trim().slice(0, 500) : '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('products').insertOne(product);
    res.status(201).json({ id: product.id, ...product });
  } catch (error) {
    console.error('Erreur lors de la création du produit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { name, price, image, secondImage, additionalImages, category, collection, color, isNew, briefDescription, surcharge1m20, surchargeSurMesure } = req.body;

    const updateData = {
      updatedAt: new Date()
    };

    if (name) updateData.name = name;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (image !== undefined) updateData.image = image;
    if (secondImage !== undefined) updateData.secondImage = secondImage;
    if (additionalImages !== undefined) {
      const list = Array.isArray(additionalImages) ? additionalImages : [];
      updateData.additionalImages = list.filter((u) => typeof u === 'string' && u.trim().length > 0);
    }
    if (category) {
      updateData.category = category;
      updateData.sizes = category === 'laisses' ? ['1m', '1m20'] : (category === 'colliers' || category === 'harnais') ? ['XS', 'S', 'M', 'L', 'XL'] : [];
    }
    if (collection) updateData.collection = collection;
    if (color !== undefined) {
      updateData.color = Array.isArray(color) ? color : (color ? color.split(',').map(c => c.trim()) : []);
    }
    if (surcharge1m20 !== undefined) {
      updateData.surcharge1m20 = surcharge1m20 !== '' && surcharge1m20 !== null ? parseFloat(String(surcharge1m20).replace(',', '.')) : null;
    }
    if (surchargeSurMesure !== undefined) {
      updateData.surchargeSurMesure = surchargeSurMesure !== '' && surchargeSurMesure !== null ? parseFloat(String(surchargeSurMesure).replace(',', '.')) : null;
    }
    if (briefDescription !== undefined) {
      updateData.briefDescription = briefDescription ? String(briefDescription).trim().slice(0, 500) : '';
    }
    if (isNew !== undefined) {
      updateData.isNew = Boolean(isNew);
    }

    const result = await db.collection('products').updateOne(
      { id: productId },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    const updatedProduct = await db.collection('products').findOne({ id: productId });
    res.json({ message: 'Produit mis à jour', product: updatedProduct });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du produit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.collection('products').deleteOne({ id: parseInt(req.params.id) });
    if (result.deletedCount === 0) {
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
    const imageDoc = {
      name: name.slice(0, 255),
      data: image,
      uploadedBy: 'admin',
      uploadedAt: new Date(),
      type: 'product'
    };
    const result = await db.collection('images').insertOne(imageDoc);
    res.status(201).json({ id: result.insertedId.toString(), name: imageDoc.name, url: `data:image/jpeg;base64,${image}` });
  } catch (error) {
    console.error('Erreur lors de l\'upload de l\'image:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/gallery', async (req, res) => {
  try {
    const images = await db.collection('gallery').find({}).sort({ createdAt: -1 }).toArray();
    res.json(images.map(img => ({
      id: img._id.toString(),
      name: img.name,
      data: img.data,
      type: img.type,
      createdAt: img.createdAt
    })));
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
    const galleryItem = {
      name: name.trim(),
      data: image,
      type: type === 'professional' || type === 'client' ? type : 'professional',
      uploadedBy: 'admin',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await db.collection('gallery').insertOne(galleryItem);
    res.status(201).json({ id: result.insertedId.toString(), ...galleryItem });
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
    const updateData = {
      name: name.trim(),
      type: type === 'professional' || type === 'client' ? type : 'professional',
      updatedAt: new Date()
    };
    if (image) {
      updateData.data = image;
    }
    const result = await db.collection('gallery').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
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
    const result = await db.collection('gallery').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
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
    const collections = await db.collection('collections').find({}).sort({ name: 1 }).toArray();
    res.json(collections.map(col => ({
      id: col._id.toString(),
      name: col.name,
      createdAt: col.createdAt,
      updatedAt: col.updatedAt
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
    const existingCollection = await db.collection('collections').findOne({ 
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existingCollection) {
      return res.status(409).json({ error: 'Une collection avec ce nom existe déjà' });
    }
    const collection = {
      name: name.trim(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await db.collection('collections').insertOne(collection);
    res.status(201).json({ id: result.insertedId.toString(), name: collection.name, createdAt: collection.createdAt, updatedAt: collection.updatedAt });
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
    const existingCollection = await db.collection('collections').findOne({ 
      _id: { $ne: new ObjectId(req.params.id) },
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existingCollection) {
      return res.status(409).json({ error: 'Une collection avec ce nom existe déjà' });
    }
    const updateData = {
      name: name.trim(),
      updatedAt: new Date()
    };
    const result = await db.collection('collections').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Collection non trouvée' });
    }
    res.json({ message: 'Collection mise à jour' });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la collection:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/collections/:id', authenticateAdmin, async (req, res) => {
  try {
    const collection = await db.collection('collections').findOne({ _id: new ObjectId(req.params.id) });
    if (!collection) {
      return res.status(404).json({ error: 'Collection non trouvée' });
    }
    const productsCount = await db.collection('products').countDocuments({ collection: collection.name });
    if (productsCount > 0) {
      return res.status(400).json({ error: 'Impossible de supprimer cette collection car elle est utilisée par des produits' });
    }
    const result = await db.collection('collections').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
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
    const faqs = await db.collection('faq').find({}).toArray();
    faqs.sort((a, b) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999));
    let sortIdx = 0;
    res.json(faqs.map(faq => ({
      id: faq._id.toString(),
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      order: faq.order || 0,
      categoryOrder: faq.categoryOrder || 0,
      sortOrder: faq.sortOrder ?? sortIdx++,
      createdAt: faq.createdAt,
      updatedAt: faq.updatedAt
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
    const maxSort = await db.collection('faq').find({}).sort({ sortOrder: -1 }).limit(1).toArray();
    const nextSortOrder = (maxSort[0]?.sortOrder ?? -1) + 1;
    const faqItem = {
      category: category.trim(),
      question: question.trim(),
      answer: answer.trim(),
      order: order || 0,
      categoryOrder: categoryOrder || 0,
      sortOrder: nextSortOrder,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await db.collection('faq').insertOne(faqItem);
    res.status(201).json({ id: result.insertedId.toString(), ...faqItem });
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
    const updateData = {
      category: category.trim(),
      question: question.trim(),
      answer: answer.trim(),
      order: order || 0,
      categoryOrder: categoryOrder || 0,
      updatedAt: new Date()
    };
    const result = await db.collection('faq').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'FAQ non trouvée' });
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
    for (const it of items) {
      const { id, sortOrder } = it;
      if (!id || typeof sortOrder !== 'number') continue;
      await db.collection('faq').updateOne(
        { _id: new ObjectId(id) },
        { $set: { sortOrder, updatedAt: new Date() } }
      );
    }
    res.json({ message: 'Ordre mis à jour' });
  } catch (error) {
    console.error('Erreur lors du réordonnancement FAQ:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/faq/:id', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.collection('faq').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
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
    const doc = await db.collection('settings').findOne({ _id: 'pricing' });
    res.json({
      surmesurecollier: doc?.surmesurecollier ?? null,
      surmesureharnais: doc?.surmesureharnais ?? null,
      laisse1m20: doc?.laisse1m20 ?? null
    });
  } catch (error) {
    console.error('Erreur settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/settings', authenticateAdmin, async (req, res) => {
  try {
    const { surmesurecollier, surmesureharnais, laisse1m20 } = req.body;
    const update = {};
    if (surmesurecollier !== undefined) update.surmesurecollier = surmesurecollier === '' || surmesurecollier === null ? null : parseFloat(String(surmesurecollier).replace(',', '.'));
    if (surmesureharnais !== undefined) update.surmesureharnais = surmesureharnais === '' || surmesureharnais === null ? null : parseFloat(String(surmesureharnais).replace(',', '.'));
    if (laisse1m20 !== undefined) update.laisse1m20 = laisse1m20 === '' || laisse1m20 === null ? null : parseFloat(String(laisse1m20).replace(',', '.'));
    await db.collection('settings').updateOne(
      { _id: 'pricing' },
      { $set: { ...update, updatedAt: new Date() } },
      { upsert: true }
    );
    const doc = await db.collection('settings').findOne({ _id: 'pricing' });
    res.json({
      surmesurecollier: doc?.surmesurecollier ?? null,
      surmesureharnais: doc?.surmesureharnais ?? null,
      laisse1m20: doc?.laisse1m20 ?? null
    });
  } catch (error) {
    console.error('Erreur mise à jour settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/cart', authenticateToken, async (req, res) => {
  try {
    const cart = await db.collection('carts').findOne({ userId: req.user.userId });
    res.json(cart ? cart.items : []);
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
    const cart = await db.collection('carts').findOne({ userId: req.user.userId });
    const items = cart ? cart.items : [];
    const sizeKey = size != null && size !== '' ? String(size) : undefined;
    const existingIndex = items.findIndex(item =>
      item.productId === productId && (item.size || undefined) === sizeKey
    );
    if (existingIndex >= 0) {
      items[existingIndex].quantity += quantity;
    } else {
      const newItem = { productId, quantity };
      if (sizeKey) newItem.size = sizeKey;
      items.push(newItem);
    }
    await db.collection('carts').updateOne(
      { userId: req.user.userId },
      { $set: { items, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ items });
  } catch (error) {
    console.error('Erreur lors de l\'ajout au panier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/cart/:productId', authenticateToken, async (req, res) => {
  try {
    const { quantity, size } = req.body;
    const cart = await db.collection('carts').findOne({ userId: req.user.userId });
    if (!cart) {
      return res.status(404).json({ error: 'Panier non trouvé' });
    }
    const sizeKey = size != null && size !== '' ? String(size) : undefined;
    const productId = parseInt(req.params.productId);
    const items = cart.items.filter(item =>
      !(item.productId === productId && (item.size || undefined) === sizeKey)
    );
    if (quantity > 0) {
      const newItem = { productId, quantity };
      if (sizeKey) newItem.size = sizeKey;
      items.push(newItem);
    }
    await db.collection('carts').updateOne(
      { userId: req.user.userId },
      { $set: { items, updatedAt: new Date() } }
    );
    res.json({ items });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du panier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/cart/:productId', authenticateToken, async (req, res) => {
  try {
    const size = req.query.size;
    const cart = await db.collection('carts').findOne({ userId: req.user.userId });
    if (!cart) {
      return res.status(404).json({ error: 'Panier non trouvé' });
    }
    const sizeKey = size != null && size !== '' ? String(size) : undefined;
    const productId = parseInt(req.params.productId);
    const items = cart.items.filter(item =>
      !(item.productId === productId && (item.size || undefined) === sizeKey)
    );
    await db.collection('carts').updateOne(
      { userId: req.user.userId },
      { $set: { items, updatedAt: new Date() } }
    );
    res.json({ items });
  } catch (error) {
    console.error('Erreur lors de la suppression du panier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const favorites = await db.collection('favorites').findOne({ userId: req.user.userId });
    res.json(favorites ? favorites.productIds : []);
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
    const favorites = await db.collection('favorites').findOne({ userId: req.user.userId });
    const productIds = favorites ? favorites.productIds : [];
    if (!productIds.includes(productId)) {
      productIds.push(productId);
    }
    await db.collection('favorites').updateOne(
      { userId: req.user.userId },
      { $set: { productIds, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ productIds });
  } catch (error) {
    console.error('Erreur lors de l\'ajout aux favoris:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/favorites/:productId', authenticateToken, async (req, res) => {
  try {
    const favorites = await db.collection('favorites').findOne({ userId: req.user.userId });
    if (!favorites) {
      return res.status(404).json({ error: 'Favoris non trouvés' });
    }
    const productIds = favorites.productIds.filter(id => id !== parseInt(req.params.productId));
    await db.collection('favorites').updateOne(
      { userId: req.user.userId },
      { $set: { productIds, updatedAt: new Date() } }
    );
    res.json({ productIds });
  } catch (error) {
    console.error('Erreur lors de la suppression des favoris:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { items, shippingAddress, total, dogInfo, notes, promoCode, shippingAmount, feesAmount } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items requis' });
    }
    if (!shippingAddress) {
      return res.status(400).json({ error: 'Informations de contact requises' });
    }
    if (!dogInfo || !dogInfo.breed || !dogInfo.age) {
      return res.status(400).json({ error: 'Informations sur le chien requises (race et âge)' });
    }
    
    let validatedPromoCode = null;
    if (promoCode && typeof promoCode === 'string' && promoCode.trim() !== '') {
      const promo = await db.collection('promo_codes').findOne({ 
        code: promoCode.toUpperCase().trim() 
      });
      
      if (promo && promo.isActive !== false && promo.currentUses < promo.maxUses) {
        const now = new Date();
        const isValidDate = (!promo.startDate || new Date(promo.startDate) <= now) && 
                           (!promo.endDate || new Date(promo.endDate) >= now);
        
        if (isValidDate) {
          validatedPromoCode = {
            code: promo.code,
            name: promo.name,
            discountType: promo.discountType,
            discountValue: promo.discountValue
          };
        }
      }
    }
    
    const order = {
      userId: req.user.userId,
      items,
      shippingAddress,
      dogInfo: {
        breed: dogInfo.breed,
        age: dogInfo.age,
        tourDeCou: dogInfo.tourDeCou || null,
        tourDeTaille: dogInfo.tourDeTaille || null,
        surMesureCollier: !!dogInfo.surMesureCollier,
        surMesureHarnais: !!dogInfo.surMesureHarnais
      },
      notes: notes || '',
      total: parseFloat(total),
      originalTotal: validatedPromoCode ? parseFloat(total) : null,
      promoCode: validatedPromoCode,
      shippingAmount: shippingAmount != null ? parseFloat(shippingAmount) : null,
      feesAmount: feesAmount != null ? parseFloat(feesAmount) : null,
      status: 'pending_validation',
      counterProposal: null,
      paymentInfo: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const dayPrefix = `${year}${month}${day}`;
    
    const dayOrders = await db.collection('orders').find({
      orderNumber: { $regex: `^${dayPrefix}` }
    }).toArray();
    
    let maxNumber = 0;
    dayOrders.forEach(order => {
      if (order.orderNumber) {
        const match = order.orderNumber.match(/^(\d{8})(\d+)$/);
        if (match) {
          const num = parseInt(match[2], 10);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    });
    
    const nextNumber = (maxNumber + 1).toString().padStart(4, '0');
    const orderNumber = `${dayPrefix}${nextNumber}`;
    order.orderNumber = orderNumber;
    const result = await db.collection('orders').insertOne(order);
    await db.collection('carts').updateOne(
      { userId: req.user.userId },
      { $set: { items: [], updatedAt: new Date() } }
    );

    try {
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(req.user.userId) },
        { projection: { email: 1, firstName: 1, lastName: 1 } }
      );
      const productMap = await getProductMapByIds((order.items || []).map(i => i.productId));
      const ship = order.shippingAddress || {};
      const itemsForEmail = (order.items || []).map(item => ({
        name: (productMap[item.productId] && productMap[item.productId].name) || `Produit #${item.productId}`,
        quantity: item.quantity,
        price: item.price
      }));
      const shippingCost = order.shippingAmount != null ? Number(order.shippingAmount) : 5.9;
      const dogInfoStr = order.dogInfo ? `Race: ${order.dogInfo.breed || ''}\nÂge: ${order.dogInfo.age || ''}${order.dogInfo.tourDeCou ? `\nTour de cou: ${order.dogInfo.tourDeCou}` : ''}${order.dogInfo.tourDeTaille ? `\nTour de taille: ${order.dogInfo.tourDeTaille}` : ''}` : '';
      const orderData = {
        orderNumber: orderNumber,
        firstName: ship.firstName || user?.firstName || '',
        lastName: ship.lastName || user?.lastName || '',
        items: itemsForEmail,
        totalAmount: Number(order.total),
        shippingCost,
        shippingAddress: ship,
        customerName: [ship.firstName, ship.lastName].filter(Boolean).join(' ') || (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Client'),
        customerEmail: ship.email || user?.email || '',
        customerPhone: ship.phone || '',
        paymentMethod: 'En attente de validation',
        dogInfo: dogInfoStr || undefined,
        notes: order.notes || undefined
      };
      await sendNewOrderNotificationEmail(orderData);
    } catch (emailErr) {
      console.error('Erreur envoi email nouvelle commande (non-bloquant):', emailErr);
    }

    res.status(201).json({ id: result.insertedId.toString(), orderNumber, ...order });
  } catch (error) {
    console.error('Erreur lors de la création de la commande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await db.collection('orders').find({ userId: req.user.userId }).sort({ createdAt: -1 }).toArray();
    res.json(orders.map(order => ({
      id: order._id.toString(),
      orderNumber: order.orderNumber || null,
      items: order.items,
      shippingAddress: order.shippingAddress,
      dogInfo: order.dogInfo,
      notes: order.notes,
      total: order.total,
      originalTotal: order.originalTotal || null,
      promoCode: order.promoCode || null,
      shippingAmount: order.shippingAmount ?? null,
      feesAmount: order.feesAmount ?? null,
      status: order.status,
      counterProposal: order.counterProposal,
      paymentInfo: order.paymentInfo,
      rejectionReason: order.rejectionReason,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    })));
  } catch (error) {
    console.error('Erreur lors de la récupération des commandes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/orders/admin', authenticateAdmin, async (req, res) => {
  try {
    const orders = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
    const ordersWithUsers = await Promise.all(orders.map(async (order) => {
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(order.userId) },
        { projection: { email: 1, firstName: 1, lastName: 1 } }
      );
      return {
        id: order._id.toString(),
        orderNumber: order.orderNumber || null,
        user: user ? { email: user.email, firstName: user.firstName, lastName: user.lastName } : null,
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
    res.json(ordersWithUsers);
  } catch (error) {
    console.error('Erreur lors de la récupération des commandes admin:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/orders/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status, rejectionReason, counterProposal } = req.body;
    const validStatuses = ['pending_validation', 'pending_counter_proposal', 'validated', 'paid', 'shipping', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }
    const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    const updateData = {
      status,
      updatedAt: new Date()
    };
    if (status === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
      updateData.counterProposal = null;
    }
    if (status === 'pending_validation' && counterProposal) {
      updateData.counterProposal = {
        items: counterProposal.items,
        total: counterProposal.total,
        message: counterProposal.message || '',
        proposedAt: new Date()
      };
      updateData.status = 'pending_counter_proposal';
    }
    if (status === 'validated') {
      if (order.counterProposal) {
        updateData.items = order.counterProposal.items;
        updateData.total = order.counterProposal.total;
      }
      updateData.counterProposal = null;
    }
    if (status === 'paid') {
      updateData.paymentInfo = { method: 'admin', paidAt: new Date(), ...(order.paymentInfo || {}) };
    }
    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    if (status === 'validated') {
      try {
        const updatedOrder = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
        const user = await db.collection('users').findOne(
          { _id: new ObjectId(updatedOrder.userId) },
          { projection: { email: 1, firstName: 1, lastName: 1 } }
        );
        const productMap = await getProductMapByIds((updatedOrder.items || []).map(i => i.productId));
        const ship = updatedOrder.shippingAddress || {};
        const itemsForEmail = (updatedOrder.items || []).map(item => ({
          name: (productMap[item.productId] && productMap[item.productId].name) || `Produit #${item.productId}`,
          quantity: item.quantity,
          price: item.price
        }));
        const shippingCost = updatedOrder.shippingAmount != null ? Number(updatedOrder.shippingAmount) : 5.9;
        const orderData = {
          orderNumber: updatedOrder.orderNumber || updatedOrder._id.toString(),
          firstName: ship.firstName || user?.firstName || '',
          lastName: ship.lastName || user?.lastName || '',
          items: itemsForEmail,
          totalAmount: Number(updatedOrder.total),
          shippingCost,
          customerName: [ship.firstName, ship.lastName].filter(Boolean).join(' ') || (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Client')
        };
        const clientEmail = ship.email || user?.email;
        if (clientEmail) {
          await sendOrderValidatedEmail(clientEmail, orderData);
        }
      } catch (emailErr) {
        console.error('Erreur envoi email commande validée (non-bloquant):', emailErr);
      }
    }

    if (status === 'paid') {
      const updatedOrder = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
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
    const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
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
      const updateData = {
        items: order.counterProposal.items,
        total: order.counterProposal.total,
        status: 'validated',
        counterProposal: null,
        updatedAt: new Date()
      };
      await db.collection('orders').updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updateData }
      );
      try {
        const updatedOrder = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
        const user = await db.collection('users').findOne(
          { _id: new ObjectId(updatedOrder.userId) },
          { projection: { email: 1, firstName: 1, lastName: 1 } }
        );
        const productMap = await getProductMapByIds((updatedOrder.items || []).map(i => i.productId));
        const ship = updatedOrder.shippingAddress || {};
        const itemsForEmail = (updatedOrder.items || []).map(item => ({
          name: (productMap[item.productId] && productMap[item.productId].name) || `Produit #${item.productId}`,
          quantity: item.quantity,
          price: item.price
        }));
        const shippingCost = updatedOrder.shippingAmount != null ? Number(updatedOrder.shippingAmount) : 5.9;
        const orderData = {
          orderNumber: updatedOrder.orderNumber || updatedOrder._id.toString(),
          items: itemsForEmail,
          totalAmount: Number(updatedOrder.total),
          shippingCost,
          customerName: [ship.firstName, ship.lastName].filter(Boolean).join(' ') || (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Client')
        };
        const clientEmail = ship.email || user?.email;
        if (clientEmail) {
          await sendOrderValidatedEmail(clientEmail, orderData);
        }
      } catch (emailErr) {
        console.error('Erreur envoi email commande validée (non-bloquant):', emailErr);
      }
      res.json({ message: 'Contre-proposition acceptée', status: 'validated' });
    } else if (newProposal) {
      const updateData = {
        counterProposal: {
          items: newProposal.items,
          total: newProposal.total,
          message: newProposal.message || '',
          proposedAt: new Date()
        },
        status: 'pending_validation',
        updatedAt: new Date()
      };
      await db.collection('orders').updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updateData }
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
    const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    const deletableStatuses = ['pending_validation', 'pending_counter_proposal', 'validated', 'rejected'];
    if (!deletableStatuses.includes(order.status)) {
      return res.status(400).json({ error: 'Cette commande ne peut pas être supprimée (déjà payée ou en cours)' });
    }
    await db.collection('orders').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: 'Commande supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la commande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/orders/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    if (order.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    const nonPayableStatuses = ['pending_validation', 'pending_counter_proposal', 'validated'];
    if (!nonPayableStatuses.includes(order.status)) {
      return res.status(400).json({ error: 'Cette commande ne peut pas être annulée (déjà payée ou en cours)' });
    }
    const updateData = {
      status: 'rejected',
      rejectionReason: 'Annulée par le client',
      updatedAt: new Date()
    };
    await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
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
    const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
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

    const adminAuth = await db.collection('admin_auth').findOne({});
    if (!adminAuth) {
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
      await logAdminAttempt(clientIp, false, { reason: 'Configuration admin introuvable', userAgent });
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const startTime = Date.now();
    const passwordMatch = await bcrypt.compare(password, adminAuth.passwordHash);
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
    await db.collection('admin_auth').updateOne(
      { _id: adminAuth._id },
      { $set: { lastLogin: new Date(), lastLoginIp: clientIp } }
    );

    await detectBotPattern();

    res.json({
      message: 'Connexion admin réussie',
      token,
      expiresIn: ADMIN_JWT_EXPIRATION
    });
  } catch (error) {
    console.error('Erreur lors de la connexion admin:', error);
    const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    await logAdminAttempt(clientIp, false, { reason: 'Erreur serveur', userAgent });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function isIpBanned(ip) {
  try {
    const ban = await db.collection('ip_bans').findOne({
      ip: ip,
      expiresAt: { $gt: new Date() }
    });
    return !!ban;
  } catch (error) {
    console.error('Erreur lors de la vérification du ban:', error);
    return false;
  }
}

async function banIp(ip, durationMinutes = 60) {
  try {
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    await db.collection('ip_bans').updateOne(
      { ip: ip },
      { 
        $set: { 
          ip: ip,
          bannedAt: new Date(),
          expiresAt: expiresAt,
          reason: 'Trop de tentatives échouées'
        }
      },
      { upsert: true }
    );
    console.warn(`🚫 IP ${ip} bannie jusqu'à ${expiresAt.toISOString()}`);
  } catch (error) {
    console.error('Erreur lors du ban IP:', error);
  }
}

async function getCooldownTime(ip) {
  try {
    const recentAttempts = await db.collection('admin_login_attempts').find({
      ip: ip,
      timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
    }).sort({ timestamp: -1 }).limit(5).toArray();

    if (recentAttempts.length === 0) return 0;

    const failures = recentAttempts.filter(a => !a.success);
    if (failures.length === 0) return 0;

    const lastFailure = failures[0];
    const timeSinceLastFailure = Date.now() - lastFailure.timestamp.getTime();
    
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
    
    await db.collection('admin_login_attempts').insertOne({
      ip: ip,
      success: success,
      reason: reasonText,
      timestamp: new Date(),
      userAgent: userAgent
    });

    if (!success) {
      const recentFailures = await db.collection('admin_login_attempts').countDocuments({
        ip: ip,
        success: false,
        timestamp: { $gte: new Date(Date.now() - 15 * 60 * 1000) }
      });

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
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const attempts = await db.collection('admin_login_attempts').aggregate([
      {
        $match: {
          timestamp: { $gte: oneHourAgo },
          success: false
        }
      },
      {
        $group: {
          _id: '$ip',
          count: { $sum: 1 },
          uniqueUserAgents: { $addToSet: '$userAgent' }
        }
      },
      {
        $match: {
          count: { $gte: 10 }
        }
      }
    ]).toArray();

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
    // Stats lues depuis la table payment_stats (remplie à chaque paiement réussi)
    const records = await db.collection('payment_stats').find({}).sort({ date: 1 }).toArray();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    let totalRevenue = 0;
    let monthlyRevenue = 0;
    let lastMonthRevenue = 0;
    const dailyStatsMap = {};
    const collectionStats = {};
    const categoryStats = {};

    for (const rec of records) {
      const orderTotal = Number(rec.totalAmount) || 0;
      const d = rec.date ? new Date(rec.date) : new Date();

      totalRevenue += orderTotal;

      const dMonthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      if (dMonthStart.getTime() === monthStart.getTime()) {
        monthlyRevenue += orderTotal;
      } else if (d >= lastMonthStart && d <= lastMonthEnd) {
        lastMonthRevenue += orderTotal;
      }

      const dayKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (!dailyStatsMap[dayKey]) dailyStatsMap[dayKey] = { revenue: 0, orders: 0 };
      dailyStatsMap[dayKey].revenue += orderTotal;
      dailyStatsMap[dayKey].orders += 1;

      for (const item of rec.items || []) {
        const collection = item.collection || 'Autre';
        const category = item.category || 'Autre';
        const itemTotal = item.itemTotal || 0;
        collectionStats[collection] = (collectionStats[collection] || 0) + itemTotal;
        categoryStats[category] = (categoryStats[category] || 0) + itemTotal;
      }
    }

    const totalOrders = records.length;
    const monthlyOrders = records.filter(r => {
      const d = r.date ? new Date(r.date) : new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const lastMonthOrders = records.filter(r => {
      const d = r.date ? new Date(r.date) : new Date();
      return d >= lastMonthStart && d <= lastMonthEnd;
    }).length;

    const monthlyAverageOrderValue = monthlyOrders > 0 ? monthlyRevenue / monthlyOrders : 0;
    const lastMonthAverageOrderValue = lastMonthOrders > 0 ? lastMonthRevenue / lastMonthOrders : 0;

    const revenueChange = lastMonthRevenue > 0
      ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : (monthlyRevenue > 0 ? 100 : 0);
    const ordersChange = lastMonthOrders > 0
      ? ((monthlyOrders - lastMonthOrders) / lastMonthOrders) * 100
      : (monthlyOrders > 0 ? 100 : 0);
    const averageOrderValueChange = lastMonthAverageOrderValue > 0
      ? ((monthlyAverageOrderValue - lastMonthAverageOrderValue) / lastMonthAverageOrderValue) * 100
      : (monthlyAverageOrderValue > 0 ? 100 : 0);

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dayKey = date.getTime();
      const dayStat = dailyStatsMap[dayKey] || { revenue: 0, orders: 0 };
      const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][date.getDay()];
      last7Days.push({ date: dayName, revenue: dayStat.revenue, orders: dayStat.orders });
    }

    res.json({
      totalRevenue,
      totalOrders,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      monthlyRevenue,
      monthlyOrders,
      monthlyAverageOrderValue,
      lastMonthRevenue,
      lastMonthOrders,
      lastMonthAverageOrderValue,
      revenueChange: Math.round(revenueChange * 10) / 10,
      ordersChange: Math.round(ordersChange * 10) / 10,
      averageOrderValueChange: Math.round(averageOrderValueChange * 10) / 10,
      dailyStats: last7Days,
      collectionStats,
      categoryStats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des stats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function insertPaymentStat(order) {
  try {
    if (!db) {
      console.error('❌ [PAYMENT_STATS] DB non initialisée');
      return;
    }
    const existing = await db.collection('payment_stats').findOne({ orderId: order._id });
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

    await db.collection('payment_stats').insertOne({
      orderId: order._id,
      date: new Date(date),
      totalAmount,
      items,
      createdAt: new Date()
    });
    console.log('✅ [PAYMENT_STATS] Enregistrement ajouté pour commande', order._id.toString());
  } catch (error) {
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
    const promoCodes = await db.collection('promo_codes').find({}).sort({ createdAt: -1 }).toArray();
    const formattedCodes = promoCodes.map(code => ({
      id: code._id.toString(),
      name: code.name || null,
      code: code.code,
      discountType: code.discountType,
      discountValue: code.discountValue,
      maxUses: code.maxUses,
      currentUses: code.currentUses || 0,
      isActive: code.isActive !== false,
      startDate: code.startDate || null,
      endDate: code.endDate || null,
      createdAt: code.createdAt,
      updatedAt: code.updatedAt
    }));
    res.json(formattedCodes);
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
        const existing = await db.collection('promo_codes').findOne({ code: finalCode });
        if (!existing) break;
        attempts++;
        if (attempts > 10) {
          return res.status(500).json({ error: 'Impossible de générer un code unique' });
        }
      } while (true);
    } else {
      finalCode = finalCode.toUpperCase().trim();
      const existing = await db.collection('promo_codes').findOne({ code: finalCode });
      if (existing) {
        return res.status(409).json({ error: 'Ce code promo existe déjà' });
      }
    }
    
    const promoCode = {
      name: name && name.trim() ? name.trim().slice(0, 100) : null,
      code: finalCode,
      discountType,
      discountValue: parseFloat(discountValue),
      maxUses: parseInt(maxUses),
      currentUses: 0,
      isActive: isActive !== false,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await db.collection('promo_codes').insertOne(promoCode);
    
    res.status(201).json({
      message: 'Code promo créé avec succès',
      promoCode: {
        id: result.insertedId.toString(),
        ...promoCode
      }
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
    
    const existingCode = await db.collection('promo_codes').findOne({ _id: new ObjectId(id) });
    if (!existingCode) {
      return res.status(404).json({ error: 'Code promo non trouvé' });
    }
    
    const updateData = {};
    
    if (name !== undefined) {
      if (name === null || name === '') {
        updateData.name = null;
      } else if (typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100) {
        updateData.name = name.trim();
      } else {
        return res.status(400).json({ error: 'Le nom doit contenir entre 2 et 100 caractères' });
      }
    }
    
    if (code !== undefined && code !== existingCode.code) {
      const newCode = code.toUpperCase().trim();
      if (!/^[A-Z0-9]{3,50}$/.test(newCode)) {
        return res.status(400).json({ error: 'Le code doit contenir uniquement des lettres majuscules et chiffres (3-50 caractères)' });
      }
      const codeExists = await db.collection('promo_codes').findOne({ 
        code: newCode,
        _id: { $ne: new ObjectId(id) }
      });
      if (codeExists) {
        return res.status(409).json({ error: 'Ce code promo existe déjà' });
      }
      updateData.code = newCode;
    }
    
    if (discountType !== undefined) {
      if (discountType !== 'percentage' && discountType !== 'fixed') {
        return res.status(400).json({ error: 'Le type de réduction doit être "percentage" ou "fixed"' });
      }
      updateData.discountType = discountType;
    }
    
    if (discountValue !== undefined) {
      const value = parseFloat(discountValue);
      if (isNaN(value) || value <= 0) {
        return res.status(400).json({ error: 'La valeur de réduction doit être un nombre positif' });
      }
      const type = updateData.discountType || existingCode.discountType;
      if (type === 'percentage' && value > 100) {
        return res.status(400).json({ error: 'Le pourcentage de réduction ne peut pas dépasser 100%' });
      }
      if (type === 'fixed' && value > 10000) {
        return res.status(400).json({ error: 'La réduction fixe ne peut pas dépasser 10000€' });
      }
      updateData.discountValue = value;
    }
    
    if (maxUses !== undefined) {
      const uses = parseInt(maxUses);
      if (isNaN(uses) || uses < 1 || uses > 1000000) {
        return res.status(400).json({ error: 'Le nombre d\'utilisations max doit être un nombre entre 1 et 1000000' });
      }
      if (uses < existingCode.currentUses) {
        return res.status(400).json({ error: 'Le nombre d\'utilisations max ne peut pas être inférieur au nombre d\'utilisations actuelles' });
      }
      updateData.maxUses = uses;
    }
    
    if (startDate !== undefined) {
      updateData.startDate = startDate ? new Date(startDate) : null;
    }
    
    if (endDate !== undefined) {
      updateData.endDate = endDate ? new Date(endDate) : null;
    }
    
    if (isActive !== undefined) {
      updateData.isActive = isActive === true;
    }
    
    const finalStartDate = updateData.startDate !== undefined ? updateData.startDate : existingCode.startDate;
    const finalEndDate = updateData.endDate !== undefined ? updateData.endDate : existingCode.endDate;
    
    if (finalStartDate && finalEndDate) {
      const start = new Date(finalStartDate);
      const end = new Date(finalEndDate);
      if (end <= start) {
        return res.status(400).json({ error: 'La date de fin doit être postérieure à la date de début' });
      }
    }
    
    updateData.updatedAt = new Date();
    
    await db.collection('promo_codes').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    
    const updatedCode = await db.collection('promo_codes').findOne({ _id: new ObjectId(id) });
    
    res.json({
      message: 'Code promo mis à jour avec succès',
      promoCode: {
        id: updatedCode._id.toString(),
        name: updatedCode.name || null,
        code: updatedCode.code,
        discountType: updatedCode.discountType,
        discountValue: updatedCode.discountValue,
        maxUses: updatedCode.maxUses,
        currentUses: updatedCode.currentUses || 0,
        isActive: updatedCode.isActive !== false,
        startDate: updatedCode.startDate || null,
        endDate: updatedCode.endDate || null,
        createdAt: updatedCode.createdAt,
        updatedAt: updatedCode.updatedAt
      }
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du code promo:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/promo-codes/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.collection('promo_codes').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
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
    
    const promoCode = await db.collection('promo_codes').findOne({ 
      code: code.toUpperCase().trim() 
    });
    
    if (!promoCode) {
      return res.status(404).json({ error: 'Code promo invalide' });
    }
    
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

app.post('/api/orders/:id/create-payment-intent', authenticateToken, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe non configuré. Ajoutez STRIPE_SECRET_KEY dans Backend/.env (voir STRIPE.md).' });
  }
  try {
    const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ error: 'Commande non trouvée' });
    if (order.userId !== req.user.userId) return res.status(403).json({ error: 'Non autorisé' });
    if (order.status !== 'validated') return res.status(400).json({ error: 'La commande doit être validée avant le paiement' });
    const amountCents = Math.round(Number(order.total) * 100);
    if (amountCents < 50) return res.status(400).json({ error: 'Montant minimum 0,50 €' });
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      metadata: { orderId: String(order._id) },
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
    const order = await db.collection('orders').findOne({ _id: new ObjectId(orderIdParam) });
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
      const updateData = {
        status: 'paid',
        paymentInfo: { method: 'stripe', paymentIntentId, paidAt: new Date() },
        updatedAt: new Date()
      };
      if (shippingAddress) updateData.shippingAddress = shippingAddress;
      await db.collection('orders').updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updateData }
      );
      const updatedOrder = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
      await insertPaymentStat(updatedOrder);

      const user = await db.collection('users').findOne(
        { _id: new ObjectId(updatedOrder.userId) },
        { projection: { email: 1, firstName: 1, lastName: 1 } }
      );
      const productMap = await getProductMapByIds((updatedOrder.items || []).map(i => i.productId));
      const ship = updatedOrder.shippingAddress || {};
      const itemsForEmail = (updatedOrder.items || []).map(item => ({
        name: (productMap[item.productId] && productMap[item.productId].name) || `Produit #${item.productId}`,
        quantity: item.quantity,
        price: item.price
      }));
      const shippingCost = updatedOrder.shippingAmount != null ? Number(updatedOrder.shippingAmount) : 5.9;
      const orderData = {
        orderNumber: updatedOrder.orderNumber || updatedOrder._id.toString(),
        firstName: ship.firstName || user?.firstName || '',
        lastName: ship.lastName || user?.lastName || '',
        items: itemsForEmail,
        totalAmount: Number(updatedOrder.total),
        shippingCost,
        shippingAddress: ship,
        customerName: [ship.firstName, ship.lastName].filter(Boolean).join(' ') || (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Client'),
        customerEmail: ship.email || user?.email || '',
        customerPhone: ship.phone || '',
        paymentMethod: 'Stripe'
      };
      try {
        // Facture envoyée au client (email livraison prioritaire, sinon email compte)
        const clientEmail = ship.email || user?.email;
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
      const promo = await db.collection('promo_codes').findOne({ 
        code: promoCode.toUpperCase().trim() 
      });
      
      if (promo && promo.isActive !== false && promo.currentUses < promo.maxUses) {
        const now = new Date();
        const isValidDate = (!promo.startDate || new Date(promo.startDate) <= now) && 
                           (!promo.endDate || new Date(promo.endDate) >= now);
        
        if (isValidDate) {
          let discountAmount = 0;
          if (promo.discountType === 'percentage') {
            discountAmount = (order.total * promo.discountValue) / 100;
          } else {
            discountAmount = Math.min(promo.discountValue, order.total);
          }
          
          finalTotal = Math.max(0, order.total - discountAmount);
          appliedPromoCode = {
            code: promo.code,
            name: promo.name,
            discountType: promo.discountType,
            discountValue: promo.discountValue,
            discountAmount: parseFloat(discountAmount.toFixed(2))
          };
          
          await db.collection('promo_codes').updateOne(
            { _id: promo._id },
            { 
              $inc: { currentUses: 1 },
              $set: { updatedAt: new Date() }
            }
          );
        }
      }
    }
    
    const updateData = {
      status: 'paid',
      paymentInfo: {
        method: paymentMethod,
        cardNumber: cardNumber ? cardNumber.slice(-4) : null,
        paidAt: new Date()
      },
      total: parseFloat(finalTotal.toFixed(2)),
      originalTotal: order.total,
      promoCode: appliedPromoCode,
      updatedAt: new Date()
    };
    if (shippingAddress) {
      updateData.shippingAddress = shippingAddress;
    }
    await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );

    const updatedOrder = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    await insertPaymentStat(updatedOrder);

    res.json({ message: 'Paiement enregistré', status: 'paid' });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du paiement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.use((err, req, res, next) => {
  console.error('[EXPRESS] Erreur non gérée:', err?.message || err, err?.stack);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

console.log('[BOOT] Écoute sur le port', PORT);
try {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    connectToDatabase();
  });
} catch (err) {
  console.error('[BOOT] Erreur au démarrage:', err);
  process.exit(1);
}

process.on('SIGTERM', async () => {
  if (client) {
    await client.close();
    console.log('Connexion MongoDB fermée');
  }
  process.exit(0);
});

