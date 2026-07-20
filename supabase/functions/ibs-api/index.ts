import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

const cleanText = (value: unknown, max = 500) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const slugify = (value: unknown) => cleanText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `bat-${Date.now()}`;

function cleanProduct(input: Record<string, unknown>, existing: Record<string, unknown> = {}) {
  const name = cleanText(input.name ?? existing.name, 100);
  const images = Array.isArray(input.images) ? input.images.map((x) => cleanText(x, 900)).filter(Boolean).slice(0, 16) : (existing.images ?? []);
  const features = Array.isArray(input.features) ? input.features.map((x) => cleanText(x, 140)).filter(Boolean).slice(0, 12) : (existing.features ?? []);
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
    features,
    images,
    featured: Boolean(input.featured ?? existing.featured),
    inStock: Boolean(input.inStock ?? existing.inStock),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'site';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    if (action === 'site' && req.method === 'GET') {
      const [{ data: settingRow, error: settingsError }, { data: productRows, error: productsError }] = await Promise.all([
        supabase.from('site_settings').select('data').eq('id', 1).single(),
        supabase.from('products').select('data,position').order('position', { ascending: true }),
      ]);
      if (settingsError || productsError) throw settingsError || productsError;
      return json({ settings: settingRow.data, products: (productRows ?? []).map((row) => row.data) });
    }

    const suppliedPassword = req.headers.get('x-admin-password') || '';
    const adminPassword = Deno.env.get('ADMIN_PASSWORD') || 'IBS@2026';
    if (suppliedPassword !== adminPassword) return json({ error: 'Wrong admin password.' }, 401);
    if (action === 'login') return json({ ok: true });

    if (action === 'settings' && req.method === 'PUT') {
      const incoming = await req.json();
      const { data: row, error } = await supabase.from('site_settings').select('data').eq('id', 1).single();
      if (error) throw error;
      const settings = { ...(row.data || {}) };
      const allowed = ['brandName','shortName','tagline','announcement','heroTitle','heroText','heroImage','heroMiniOne','heroMiniTwo','storyImage1','storyImage2','storyImage3','logo','whatsapp','phoneDisplay','instagram','developerName','developerInstagram','deliveryTime','shippingNote','returnPolicy','codNote','editorialDisclaimer'];
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(incoming, key)) settings[key] = cleanText(incoming[key], ['heroText','returnPolicy','codNote','editorialDisclaimer'].includes(key) ? 1400 : 300);
      for (const key of ['defaultPrice','defaultMrp','bookingAmount']) if (Object.prototype.hasOwnProperty.call(incoming, key)) settings[key] = Math.max(0, Number(incoming[key]) || 0);
      if (Array.isArray(incoming.freeServices)) settings.freeServices = incoming.freeServices.map((x: unknown) => cleanText(x, 120)).filter(Boolean).slice(0, 10);
      const { error: saveError } = await supabase.from('site_settings').upsert({ id: 1, data: settings, updated_at: new Date().toISOString() });
      if (saveError) throw saveError;
      return json({ ok: true, settings });
    }

    if (action === 'products' && req.method === 'POST') {
      const product = cleanProduct(await req.json());
      if (!product.name) return json({ error: 'Product name is required.' }, 400);
      const { data: last } = await supabase.from('products').select('position').order('position', { ascending: false }).limit(1);
      const position = (last?.[0]?.position ?? -1) + 1;
      const { error } = await supabase.from('products').insert({ id: product.id, position, data: product });
      if (error) throw error;
      return json({ ok: true, product }, 201);
    }

    if (action === 'product' && req.method === 'PUT') {
      const id = cleanText(url.searchParams.get('id'), 80);
      const { data: row, error: loadError } = await supabase.from('products').select('data').eq('id', id).single();
      if (loadError) return json({ error: 'Product not found.' }, 404);
      const product = cleanProduct({ ...(await req.json()), id }, row.data || {});
      const { error } = await supabase.from('products').update({ data: product, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return json({ ok: true, product });
    }

    if (action === 'product' && req.method === 'DELETE') {
      const id = cleanText(url.searchParams.get('id'), 80);
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'move' && req.method === 'POST') {
      const id = cleanText(url.searchParams.get('id'), 80);
      const { direction } = await req.json();
      const { data: rows, error } = await supabase.from('products').select('id,position').order('position');
      if (error) throw error;
      const index = (rows ?? []).findIndex((row) => row.id === id);
      const target = index + (direction === 'up' ? -1 : 1);
      if (index >= 0 && target >= 0 && target < (rows?.length ?? 0)) {
        const current = rows![index]; const other = rows![target];
        await supabase.from('products').update({ position: other.position }).eq('id', current.id);
        await supabase.from('products').update({ position: current.position }).eq('id', other.id);
      }
      return json({ ok: true });
    }

    if (action === 'upload' && req.method === 'POST') {
      const form = await req.formData();
      const files = form.getAll('images').filter((x): x is File => x instanceof File).slice(0, 8);
      const uploaded = [];
      for (const file of files) {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) continue;
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `uploads/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from('ibs-media').upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from('ibs-media').getPublicUrl(path);
        uploaded.push({ url: data.publicUrl, name: file.name, size: file.size });
      }
      return json({ ok: true, files: uploaded });
    }

    return json({ error: 'Unknown action.' }, 404);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
});
