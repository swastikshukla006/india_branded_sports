'use strict';

const adminState = {
  settings: {},
  products: [],
  editingProduct: null,
  editingImages: [],
  pictureValues: {}
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function setStatus(message, type = '') {
  const bar = $('#statusBar');
  if (!bar) return;
  bar.textContent = message;
  bar.className = `status-bar${type ? ` ${type}` : ''}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && url !== '/api/admin/login') showLogin();
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}

function showLogin() {
  $('#loginScreen').classList.remove('hidden');
  $('#adminShell').classList.add('hidden');
}

function showAdmin() {
  $('#loginScreen').classList.add('hidden');
  $('#adminShell').classList.remove('hidden');
}

function fillForm(form, values) {
  if (!form) return;
  [...form.elements].forEach((field) => {
    if (!field.name || !(field.name in values)) return;
    if (field.type === 'checkbox') field.checked = Boolean(values[field.name]);
    else if (field.name === 'freeServices' && Array.isArray(values.freeServices)) field.value = values.freeServices.join('\n');
    else field.value = values[field.name] ?? '';
  });
}

function formDataObject(form) {
  const data = {};
  [...form.elements].forEach((field) => {
    if (!field.name) return;
    if (field.type === 'checkbox') data[field.name] = field.checked;
    else data[field.name] = field.value;
  });
  return data;
}

async function loadStore() {
  setStatus('Loading website information…');
  const data = await api('/api/site');
  adminState.settings = data.settings || {};
  adminState.products = data.products || [];
  fillForm($('#quickForm'), adminState.settings);
  fillForm($('#policyForm'), adminState.settings);
  adminState.pictureValues = {
    logo: adminState.settings.logo,
    heroImage: adminState.settings.heroImage,
    heroMiniOne: adminState.settings.heroMiniOne,
    heroMiniTwo: adminState.settings.heroMiniTwo,
    storyImage1: adminState.settings.storyImage1,
    storyImage2: adminState.settings.storyImage2,
    storyImage3: adminState.settings.storyImage3
  };
  $('#adminLogo').src = adminState.settings.logo || '/assets/brand/logo.webp';
  renderPictures();
  renderProductList();
  setStatus('Ready. Choose a section and make your changes.', 'success');
}

function switchPanel(name) {
  $$('.nav-card').forEach((button) => button.classList.toggle('active', button.dataset.panel === name));
  $$('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${name}`));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveSettings() {
  try {
    setStatus('Saving changes…');
    const quick = formDataObject($('#quickForm'));
    const policies = formDataObject($('#policyForm'));
    policies.freeServices = String(policies.freeServices || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const payload = { ...quick, ...policies, ...adminState.pictureValues };
    ['defaultPrice', 'defaultMrp', 'bookingAmount'].forEach((key) => payload[key] = Number(payload[key] || 0));
    const data = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
    adminState.settings = data.settings;
    setStatus('Saved. The website is updated.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function createButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderProductList() {
  const list = $('#productAdminList');
  list.replaceChildren();
  if (!adminState.products.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No products yet. Press “Add New Bat”.';
    list.append(empty);
    return;
  }

  adminState.products.forEach((product, index) => {
    const card = document.createElement('article');
    card.className = 'admin-product-card';

    const image = document.createElement('img');
    image.src = product.images?.[0] || adminState.settings.logo || '/assets/brand/logo.webp';
    image.alt = product.name;
    card.append(image);

    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = product.name;
    const desc = document.createElement('p');
    desc.textContent = `${product.brand} • ${product.willow}`;
    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = `${money(product.price)} • Booking ${money(product.bookingAmount)}`;
    const stock = document.createElement('span');
    stock.className = `stock-pill${product.inStock ? '' : ' off'}`;
    stock.textContent = product.inStock ? 'Available' : 'Sold out';
    info.append(title, desc, price, stock);
    card.append(info);

    const actions = document.createElement('div');
    actions.className = 'product-card-actions';
    actions.append(
      createButton('Edit', 'small-button', () => openProductDialog(product)),
      createButton(product.inStock ? 'Mark Sold Out' : 'Mark Available', 'small-button', () => toggleStock(product)),
      createButton('↑ Up', 'small-button', () => moveProduct(product.id, 'up', index)),
      createButton('↓ Down', 'small-button', () => moveProduct(product.id, 'down', index)),
      createButton('Delete', 'small-button delete', () => deleteProduct(product))
    );
    card.append(actions);
    list.append(card);
  });
}

function openProductDialog(product = null) {
  adminState.editingProduct = product;
  adminState.editingImages = product ? [...(product.images || [])] : [];
  const form = $('#productForm');
  form.reset();
  $('#dialogTitle').textContent = product ? `Edit ${product.name}` : 'Add a new bat';
  $('#dialogEyebrow').textContent = product ? 'Edit Product' : 'New Product';
  if (product) {
    fillForm(form, product);
    form.elements.id.value = product.id;
    form.elements.features.value = (product.features || []).join('\n');
  } else {
    fillForm(form, {
      price: adminState.settings.defaultPrice || 5999,
      mrp: adminState.settings.defaultMrp || 9999,
      bookingAmount: adminState.settings.bookingAmount || 500,
      willow: 'English Willow / Kashmir Willow',
      inStock: true,
      featured: true,
      badge: 'Premium Willow'
    });
  }
  renderEditableImages();
  $('#productDialog').showModal();
}

function closeProductDialog() {
  if ($('#productDialog').open) $('#productDialog').close();
}

function renderEditableImages() {
  const wrap = $('#editableImages');
  wrap.replaceChildren();
  adminState.editingImages.forEach((src, index) => {
    const item = document.createElement('div');
    item.className = 'editable-image';
    const image = document.createElement('img');
    image.src = src;
    image.alt = `Product picture ${index + 1}`;
    item.append(image);
    item.append(createButton('×', '', () => {
      adminState.editingImages.splice(index, 1);
      renderEditableImages();
    }));
    if (index > 0) item.append(createButton('←', 'move-left', () => moveImage(index, -1)));
    if (index < adminState.editingImages.length - 1) item.append(createButton('→', 'move-right', () => moveImage(index, 1)));
    wrap.append(item);
  });
}

function moveImage(index, amount) {
  const target = index + amount;
  [adminState.editingImages[index], adminState.editingImages[target]] = [adminState.editingImages[target], adminState.editingImages[index]];
  renderEditableImages();
}

async function uploadFiles(files) {
  if (!files?.length) return [];
  const body = new FormData();
  [...files].forEach((file) => body.append('images', file));
  const data = await api('/api/admin/upload', { method: 'POST', body });
  return data.files || [];
}

async function handleProductImages(files) {
  try {
    setStatus('Uploading product pictures…');
    const uploaded = await uploadFiles(files);
    adminState.editingImages.push(...uploaded.map((file) => file.url));
    renderEditableImages();
    setStatus('Pictures uploaded. Press Save Product.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    $('#productImageUpload').value = '';
  }
}

async function saveProduct(event) {
  event.preventDefault();
  try {
    setStatus('Saving product…');
    const form = $('#productForm');
    const payload = formDataObject(form);
    payload.price = Number(payload.price || 0);
    payload.mrp = Number(payload.mrp || 0);
    payload.bookingAmount = Number(payload.bookingAmount || 0);
    payload.features = String(payload.features || '').split('\n').map((line) => line.trim()).filter(Boolean);
    payload.images = adminState.editingImages;
    const existingId = adminState.editingProduct?.id;
    if (existingId) {
      await api(`/api/admin/products/${encodeURIComponent(existingId)}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeProductDialog();
    await loadStore();
    switchPanel('products');
    setStatus('Product saved.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function toggleStock(product) {
  try {
    setStatus('Updating availability…');
    await api(`/api/admin/products/${encodeURIComponent(product.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ ...product, inStock: !product.inStock })
    });
    await loadStore();
    switchPanel('products');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function moveProduct(id, direction, index) {
  if ((direction === 'up' && index === 0) || (direction === 'down' && index === adminState.products.length - 1)) return;
  try {
    setStatus('Moving product…');
    await api(`/api/admin/products/${encodeURIComponent(id)}/move`, { method: 'POST', body: JSON.stringify({ direction }) });
    await loadStore();
    switchPanel('products');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function deleteProduct(product) {
  if (!confirm(`Delete “${product.name}”? This cannot be undone.`)) return;
  try {
    setStatus('Deleting product…');
    await api(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
    await loadStore();
    switchPanel('products');
    setStatus('Product deleted.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function renderPictures() {
  $$('#pictureGrid article').forEach((card) => {
    const key = card.dataset.key;
    const image = $('img', card);
    image.src = adminState.pictureValues[key] || '/assets/brand/logo.webp';
  });
}

async function replacePicture(card, file) {
  if (!file) return;
  try {
    card.classList.add('uploading');
    setStatus('Uploading picture…');
    const uploaded = await uploadFiles([file]);
    if (!uploaded[0]) throw new Error('Picture upload failed.');
    adminState.pictureValues[card.dataset.key] = uploaded[0].url;
    renderPictures();
    setStatus('Picture uploaded. Press “Save Pictures”.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    card.classList.remove('uploading');
    $('input[type="file"]', card).value = '';
  }
}

async function resetData() {
  if (!confirm('Restore all original product and website information? Your current admin changes will be removed.')) return;
  if (!confirm('Please confirm again: restore original data now?')) return;
  try {
    setStatus('Restoring original website…');
    await api('/api/admin/reset-demo', { method: 'POST', body: '{}' });
    await loadStore();
    switchPanel('quick');
    setStatus('Original website restored.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function wireAdminEvents() {
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#loginMessage').textContent = 'Checking password…';
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#loginPassword').value }) });
      $('#loginPassword').value = '';
      $('#loginMessage').textContent = '';
      showAdmin();
      await loadStore();
    } catch (error) {
      $('#loginMessage').textContent = error.message;
    }
  });

  $('#logoutButton').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST', body: '{}' }).catch(() => null);
    showLogin();
  });

  $$('.nav-card').forEach((button) => button.addEventListener('click', () => switchPanel(button.dataset.panel)));
  $$('.save-settings').forEach((button) => button.addEventListener('click', saveSettings));
  $('#savePicturesButton').addEventListener('click', saveSettings);
  $('#addProductButton').addEventListener('click', () => openProductDialog());
  $('#closeProductDialog').addEventListener('click', closeProductDialog);
  $('#cancelProductButton').addEventListener('click', closeProductDialog);
  $('#productForm').addEventListener('submit', saveProduct);
  $('#productImageUpload').addEventListener('change', (event) => handleProductImages(event.target.files));
  $$('#pictureGrid input[type="file"]').forEach((input) => input.addEventListener('change', (event) => replacePicture(input.closest('article'), event.target.files[0])));
  $('#resetButton').addEventListener('click', resetData);
  $('#productDialog').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeProductDialog();
  });
}

async function init() {
  wireAdminEvents();
  try {
    const session = await api('/api/admin/session');
    if (session.authenticated) {
      showAdmin();
      await loadStore();
    } else showLogin();
  } catch {
    showLogin();
  }
}

document.addEventListener('DOMContentLoaded', init);
