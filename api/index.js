const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable');
const fs = require('fs/promises');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sseattgqocdlagnhbrwe.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

function getClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) is missing in Vercel.');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function send(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

function cleanText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function slugify(value) {
  return cleanText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `bat-${Date.now()}`;
}

function cleanProduct(input = {}, existing = {}) {
  const name = cleanText(input.name ?? existing.name, 100);
  return {
    id: cleanText(input.id ?? existing.id ?? slugify(name), 80),
    name,
    brand: cleanText(input.brand ?? existing.brand, 60),
    willow: cleanText(input.willow ?? existing.willow, 120),
    price: Math.max(0, Number(input.price ?? existing.price ?? 0) || 0),
    mrp: Math.max(0, Number(input.mrp ?? existing.mrp ?? 0) || 0),
    bookingAmount: Math.max(0, Number(input.bookingAmount ?? existing.bookingAmount ?? 0) || 0),
    badge: cleanText(input.badge ?? existing.badge, 50),
    summary: cleanText(input.summary ?? existing.summary, 500),
    features: Array.isArray(input.features) ? input.features.map((x) => cleanText(x, 140)).filter(Boolean).slice(0, 12) : (existing.features || []),
    images: Array.isArray(input.images) ? input.images.map((x) => cleanText(x, 900)).filter(Boolean).slice(0, 16) : (existing.images || []),
    featured: Boolean(input.featured ?? existing.featured),
    inStock: Boolean(input.inStock ?? existing.inStock)
  };
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function authenticated(req) {
  if (!SESSION_SECRET) return false;
  const cookies = cookie.parse(req.headers.cookie || '');
  try { return jwt.verify(cookies.ibs_admin || '', SESSION_SECRET)?.role === 'admin'; } catch { return false; }
}

function setAdminCookie(res) {
  const token = jwt.sign({ role: 'admin' }, SESSION_SECRET, { expiresIn: '8h' });
  res.setHeader('Set-Cookie', cookie.serialize('ibs_admin', token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60
  }));
}

function clearAdminCookie(res) {
  res.setHeader('Set-Cookie', cookie.serialize('ibs_admin', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 }));
}

async function readStore(supabase) {
  const [{ data: settingRow, error: se }, { data: productRows, error: pe }] = await Promise.all([
    supabase.from('site_settings').select('data').eq('id', 1).single(),
    supabase.from('products').select('data,position').order('position', { ascending: true })
  ]);
  if (se || pe) throw se || pe;
  return { settings: settingRow.data, products: (productRows || []).map((row) => row.data) };
}

module.exports = async function handler(req, res) {
  try {
    const path = (req.query.path || '').toString().replace(/^\/+|\/+$/g, '');
    const supabase = getClient();

    if (req.method === 'GET' && (path === 'site' || path === '')) return send(res, 200, await readStore(supabase));
    if (req.method === 'GET' && path === 'admin/session') return send(res, 200, { authenticated: authenticated(req) });

    if (req.method === 'POST' && path === 'admin/login') {
      if (!ADMIN_PASSWORD || !SESSION_SECRET) return send(res, 500, { error: 'Admin security variables are not configured.' });
      const supplied = String(parseBody(req).password || '');
      const a = Buffer.from(supplied); const b = Buffer.from(ADMIN_PASSWORD);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(res, 401, { error: 'Wrong password.' });
      setAdminCookie(res); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && path === 'admin/logout') { clearAdminCookie(res); return send(res, 200, { ok: true }); }
    if (!authenticated(req)) return send(res, 401, { error: 'Please sign in again.' });

    if (req.method === 'PUT' && path === 'admin/settings') {
      const incoming = parseBody(req);
      const { data: row, error } = await supabase.from('site_settings').select('data').eq('id', 1).single();
      if (error) throw error;
      const settings = { ...(row.data || {}) };
      const allowed = ['brandName','shortName','tagline','announcement','heroTitle','heroText','heroImage','heroMiniOne','heroMiniTwo','storyImage1','storyImage2','storyImage3','logo','whatsapp','phoneDisplay','instagram','developerName','developerInstagram','deliveryTime','shippingNote','returnPolicy','codNote','editorialDisclaimer'];
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(incoming, key)) settings[key] = cleanText(incoming[key], ['heroText','returnPolicy','codNote','editorialDisclaimer'].includes(key) ? 1400 : 300);
      for (const key of ['defaultPrice','defaultMrp','bookingAmount']) if (Object.prototype.hasOwnProperty.call(incoming, key)) settings[key] = Math.max(0, Number(incoming[key]) || 0);
      if (Array.isArray(incoming.freeServices)) settings.freeServices = incoming.freeServices.map((x) => cleanText(x, 120)).filter(Boolean).slice(0, 10);
      const { error: saveError } = await supabase.from('site_settings').upsert({ id: 1, data: settings, updated_at: new Date().toISOString() });
      if (saveError) throw saveError;
      return send(res, 200, { ok: true, settings });
    }

    if (req.method === 'POST' && path === 'admin/upload') {
      const form = formidable({ multiples: true, maxFiles: 8, maxFileSize: 8 * 1024 * 1024, filter: ({ mimetype }) => ['image/jpeg','image/png','image/webp'].includes(mimetype || '') });
      const [, files] = await form.parse(req);
      const list = Array.isArray(files.images) ? files.images : files.images ? [files.images] : [];
      const uploaded = [];
      for (const file of list) {
        const bytes = await fs.readFile(file.filepath);
        const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
        const objectPath = `uploads/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from('ibs-media').upload(objectPath, bytes, { contentType: file.mimetype, upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from('ibs-media').getPublicUrl(objectPath);
        uploaded.push({ url: data.publicUrl, name: file.originalFilename, size: file.size });
      }
      return send(res, 200, { ok: true, files: uploaded });
    }

    if (req.method === 'POST' && path === 'admin/products') {
      const product = cleanProduct(parseBody(req));
      const { data: last } = await supabase.from('products').select('position').order('position', { ascending: false }).limit(1);
      const { error } = await supabase.from('products').insert({ id: product.id, position: (last?.[0]?.position ?? -1) + 1, data: product });
      if (error) throw error;
      return send(res, 201, { ok: true, product });
    }

    const productMatch = path.match(/^admin\/products\/([^/]+)$/);
    if (productMatch && req.method === 'PUT') {
      const id = decodeURIComponent(productMatch[1]);
      const { data: row, error: loadError } = await supabase.from('products').select('data').eq('id', id).single();
      if (loadError) return send(res, 404, { error: 'Product not found.' });
      const product = cleanProduct({ ...parseBody(req), id }, row.data || {});
      const { error } = await supabase.from('products').update({ data: product, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return send(res, 200, { ok: true, product });
    }
    if (productMatch && req.method === 'DELETE') {
      const { error } = await supabase.from('products').delete().eq('id', decodeURIComponent(productMatch[1]));
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    const moveMatch = path.match(/^admin\/products\/([^/]+)\/move$/);
    if (moveMatch && req.method === 'POST') {
      const id = decodeURIComponent(moveMatch[1]);
      const direction = parseBody(req).direction === 'up' ? -1 : 1;
      const { data: rows, error } = await supabase.from('products').select('id,position').order('position');
      if (error) throw error;
      const index = rows.findIndex((row) => row.id === id); const target = index + direction;
      if (index >= 0 && target >= 0 && target < rows.length) {
        await supabase.from('products').update({ position: rows[target].position }).eq('id', rows[index].id);
        await supabase.from('products').update({ position: rows[index].position }).eq('id', rows[target].id);
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: error.message || 'Unexpected server error.' });
  }
};
