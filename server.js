'use strict';

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const SEED_FILE = path.join(ROOT, 'seed', 'store.json');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'IBS@2026');
const SESSION_SECRET = String(process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'));

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(STORE_FILE)) {
  fs.copyFileSync(SEED_FILE, STORE_FILE);
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (error) {
    console.error('Failed to read store:', error);
    throw new Error('Website data could not be loaded.');
  }
}

function writeStore(data) {
  const temp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temp, STORE_FILE);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || `bat-${Date.now()}`;
}

function cleanText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

function cleanProduct(input, existing = {}) {
  const name = cleanText(input.name || existing.name, 100);
  const id = cleanText(input.id || existing.id || slugify(name), 80);
  const images = Array.isArray(input.images)
    ? input.images.filter((item) => typeof item === 'string' && (item.startsWith('/assets/') || item.startsWith('/uploads/'))).slice(0, 12)
    : (existing.images || []);
  const features = Array.isArray(input.features)
    ? input.features.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 10)
    : (existing.features || []);

  return {
    id,
    name,
    brand: cleanText(input.brand ?? existing.brand, 60),
    willow: cleanText(input.willow ?? existing.willow, 100),
    price: Math.max(0, Number(input.price ?? existing.price ?? 0) || 0),
    mrp: Math.max(0, Number(input.mrp ?? existing.mrp ?? 0) || 0),
    bookingAmount: Math.max(0, Number(input.bookingAmount ?? existing.bookingAmount ?? 0) || 0),
    badge: cleanText(input.badge ?? existing.badge, 40),
    summary: cleanText(input.summary ?? existing.summary, 400),
    features,
    images,
    featured: Boolean(input.featured ?? existing.featured),
    inStock: Boolean(input.inStock ?? existing.inStock)
  };
}

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(session({
  name: 'ibs_admin',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));
app.use(express.static(PUBLIC_DIR, { maxAge: '1h', etag: true }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Please sign in again.' });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
    const ext = extMap[file.mimetype] || '.img';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG and WEBP images are allowed.'));
  }
});

app.get('/api/site', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const store = readStore();
  res.json(store);
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const password = String(req.body.password || '');
  if (!safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session && req.session.isAdmin) });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const store = readStore();
  const incoming = req.body || {};
  const allowed = [
    'brandName', 'shortName', 'tagline', 'announcement', 'heroTitle', 'heroText',
    'heroImage', 'heroMiniOne', 'heroMiniTwo', 'storyImage1', 'storyImage2', 'storyImage3', 'logo', 'whatsapp',
    'phoneDisplay', 'instagram', 'developerName', 'developerInstagram', 'deliveryTime',
    'shippingNote', 'returnPolicy', 'codNote', 'editorialDisclaimer'
  ];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      const limit = ['heroText', 'returnPolicy', 'codNote', 'editorialDisclaimer'].includes(key) ? 1200 : 240;
      store.settings[key] = cleanText(incoming[key], limit);
    }
  }
  for (const key of ['defaultPrice', 'defaultMrp', 'bookingAmount']) {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      store.settings[key] = Math.max(0, Number(incoming[key]) || 0);
    }
  }
  if (Array.isArray(incoming.freeServices)) {
    store.settings.freeServices = incoming.freeServices.map((item) => cleanText(item, 100)).filter(Boolean).slice(0, 10);
  }
  writeStore(store);
  res.json({ ok: true, settings: store.settings });
});

app.post('/api/admin/upload', requireAdmin, upload.array('images', 8), (req, res) => {
  const files = (req.files || []).map((file) => ({
    url: `/uploads/${file.filename}`,
    name: file.originalname,
    size: file.size
  }));
  res.json({ ok: true, files });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const store = readStore();
  const product = cleanProduct(req.body || {});
  if (!product.name) return res.status(400).json({ error: 'Product name is required.' });
  if (store.products.some((item) => item.id === product.id)) {
    product.id = `${product.id}-${Date.now().toString().slice(-5)}`;
  }
  store.products.push(product);
  writeStore(store);
  res.status(201).json({ ok: true, product });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const store = readStore();
  const index = store.products.findIndex((item) => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Product not found.' });
  const originalId = store.products[index].id;
  const product = cleanProduct({ ...req.body, id: originalId }, store.products[index]);
  store.products[index] = product;
  writeStore(store);
  res.json({ ok: true, product });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const store = readStore();
  const before = store.products.length;
  store.products = store.products.filter((item) => item.id !== req.params.id);
  if (store.products.length === before) return res.status(404).json({ error: 'Product not found.' });
  writeStore(store);
  res.json({ ok: true });
});

app.post('/api/admin/products/:id/move', requireAdmin, (req, res) => {
  const direction = req.body.direction === 'up' ? -1 : 1;
  const store = readStore();
  const index = store.products.findIndex((item) => item.id === req.params.id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= store.products.length) return res.json({ ok: true });
  [store.products[index], store.products[target]] = [store.products[target], store.products[index]];
  writeStore(store);
  res.json({ ok: true });
});

app.post('/api/admin/reset-demo', requireAdmin, (_req, res) => {
  fs.copyFileSync(SEED_FILE, STORE_FILE);
  res.json({ ok: true });
});

app.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  const message = error instanceof multer.MulterError ? error.message : (error.message || 'Something went wrong.');
  res.status(400).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`India's Branded Sports website running on http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('Using default admin password. Set ADMIN_PASSWORD before public deployment.');
  }
});
