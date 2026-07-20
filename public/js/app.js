'use strict';

const state = {
  settings: null,
  products: [],
  activeBrand: 'all',
  query: '',
  selectedProduct: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function safeInstagram(handle) {
  return String(handle || '').replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');
}

function whatsappUrl(message) {
  const number = String(state.settings?.whatsapp || '916006699119').replace(/\D/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function generalWhatsAppMessage() {
  const settings = state.settings;
  return [
    `Hello ${settings.brandName},`,
    'I want to order a premium cricket bat.',
    `Booking amount: ${money(settings.bookingAmount)}`,
    'Please share available models, willow options and shipping charges.'
  ].join('\n');
}

function productWhatsAppMessage(product) {
  const balance = Math.max(0, Number(product.price) - Number(product.bookingAmount));
  return [
    `Hello ${state.settings.brandName},`,
    `I want to book: ${product.name}`,
    `Brand: ${product.brand}`,
    `Willow: ${product.willow}`,
    `Price: ${money(product.price)} (MRP ${money(product.mrp)})`,
    `Booking amount: ${money(product.bookingAmount)}`,
    `Remaining amount: ${money(balance)}`,
    '',
    'Please confirm availability, custom weight/profile options and shipping charges.'
  ].join('\n');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element && value !== undefined && value !== null) element.textContent = value;
}

function setImage(id, src) {
  const element = document.getElementById(id);
  if (element && src) element.src = src;
}

function setWhatsAppLinks() {
  const url = whatsappUrl(generalWhatsAppMessage());
  ['headerWhatsapp', 'heroWhatsapp', 'customWhatsapp', 'footerWhatsapp', 'floatingWhatsapp', 'footerPhone'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.href = url;
  });
}

function applySettings(settings) {
  state.settings = settings;
  document.title = `${settings.brandName} | ${settings.tagline}`;
  setText('announcement', settings.announcement);
  setText('brandName', settings.brandName);
  setText('brandTagline', settings.tagline);
  setText('heroTitle', settings.heroTitle);
  setText('heroText', settings.heroText);
  setText('footerBrandName', settings.brandName);
  setText('heroPrice', money(settings.defaultPrice));
  setText('heroMrp', `MRP ${money(settings.defaultMrp)}`);
  setText('offerPrice', money(settings.defaultPrice));
  setText('offerMrp', money(settings.defaultMrp));
  setText('offerBooking', money(settings.bookingAmount));
  setText('returnPolicy', settings.returnPolicy);
  setText('shippingPolicy', `${settings.deliveryTime}. ${settings.shippingNote}`);
  setText('codPolicy', settings.codNote);
  setText('editorialNote', settings.editorialDisclaimer);
  setImage('brandLogo', settings.logo);
  setImage('footerLogo', settings.logo);
  setImage('heroImage', settings.heroImage);
  setImage('heroMiniOne', settings.heroMiniOne);
  setImage('heroMiniTwo', settings.heroMiniTwo);
  setImage('storyImage1', settings.storyImage1);
  setImage('storyImage2', settings.storyImage2);
  setImage('storyImage3', settings.storyImage3);

  const instagram = safeInstagram(settings.instagram);
  const footerInstagram = $('#footerInstagram');
  if (footerInstagram) {
    footerInstagram.href = `https://instagram.com/${instagram}`;
    footerInstagram.textContent = `Instagram: @${instagram}`;
  }

  const developerHandle = safeInstagram(settings.developerInstagram);
  const developerCredit = $('#developerCredit');
  if (developerCredit) {
    developerCredit.href = `https://instagram.com/${developerHandle}`;
    developerCredit.textContent = `Designed & Developed by ${settings.developerName} • @${developerHandle}`;
  }

  setText('footerPhone', `WhatsApp: ${settings.phoneDisplay}`);
  setWhatsAppLinks();
}

function create(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function discountPercent(product) {
  if (!product.mrp || product.mrp <= product.price) return 0;
  return Math.round((1 - product.price / product.mrp) * 100);
}

function productCard(product) {
  const card = create('article', 'product-card reveal');
  card.dataset.productId = product.id;

  const imageWrap = create('div', 'product-image-wrap');
  const image = document.createElement('img');
  image.src = product.images?.[0] || '/assets/brand/logo.webp';
  image.alt = `${product.name} cricket bat`;
  image.loading = 'lazy';
  imageWrap.append(image);

  const badge = create('span', 'product-badge', product.badge || 'Premium Willow');
  imageWrap.append(badge);

  const stock = create('span', `stock-badge${product.inStock ? '' : ' sold-out'}`, product.inStock ? 'Available' : 'Sold out');
  imageWrap.append(stock);
  card.append(imageWrap);

  const body = create('div', 'product-body');
  body.append(create('p', 'product-brand', product.brand));
  body.append(create('h3', '', product.name));
  body.append(create('p', 'product-willow', product.willow));

  const priceRow = create('div', 'price-row');
  priceRow.append(create('strong', '', money(product.price)));
  const mrp = create('del', '', `MRP ${money(product.mrp)}`);
  priceRow.append(mrp);
  const discount = discountPercent(product);
  if (discount) priceRow.append(create('span', 'discount-chip', `${discount}% off`));
  body.append(priceRow);

  const actions = create('div', 'product-actions');
  const order = create('a', 'button button-gold', product.inStock ? `Book for ${money(product.bookingAmount)}` : 'Ask availability');
  order.href = whatsappUrl(productWhatsAppMessage(product));
  order.target = '_blank';
  order.rel = 'noopener';
  order.addEventListener('click', (event) => event.stopPropagation());
  actions.append(order);

  const view = create('button', 'view-button', '↗');
  view.type = 'button';
  view.setAttribute('aria-label', `View ${product.name}`);
  view.addEventListener('click', () => openProduct(product));
  actions.append(view);
  body.append(actions);
  card.append(body);

  card.addEventListener('click', (event) => {
    if (!event.target.closest('a, button')) openProduct(product);
  });
  return card;
}

function filteredProducts() {
  return state.products.filter((product) => {
    const brandMatch = state.activeBrand === 'all' || product.brand.toLowerCase().includes(state.activeBrand.toLowerCase());
    const text = `${product.name} ${product.brand} ${product.willow} ${product.summary}`.toLowerCase();
    const queryMatch = !state.query || text.includes(state.query.toLowerCase());
    return brandMatch && queryMatch;
  });
}

function renderProducts() {
  const grid = $('#productGrid');
  grid.replaceChildren();
  const products = filteredProducts();
  if (!products.length) {
    grid.append(create('div', 'empty-state', 'No bats match this search. Try another brand or keyword.'));
    return;
  }
  products.forEach((product) => grid.append(productCard(product)));
  observeReveals();
}

function openProduct(product) {
  state.selectedProduct = product;
  setText('modalBadge', product.badge || 'Premium Willow');
  setText('modalBrand', product.brand);
  setText('modalName', product.name);
  setText('modalSummary', product.summary);
  setText('modalPrice', money(product.price));
  setText('modalMrp', `MRP ${money(product.mrp)}`);
  setText('modalDiscount', `${discountPercent(product)}% off`);
  setText('modalBooking', money(product.bookingAmount));

  const mainImage = $('#modalImage');
  mainImage.src = product.images?.[0] || '/assets/brand/logo.webp';
  mainImage.alt = `${product.name} cricket bat`;

  const thumbs = $('#modalThumbnails');
  thumbs.replaceChildren();
  (product.images || []).forEach((src, index) => {
    const button = create('button', index === 0 ? 'active' : '');
    button.type = 'button';
    const image = document.createElement('img');
    image.src = src;
    image.alt = `${product.name} view ${index + 1}`;
    button.append(image);
    button.addEventListener('click', () => {
      mainImage.src = src;
      $$('#modalThumbnails button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
    });
    thumbs.append(button);
  });

  const featureList = $('#modalFeatures');
  featureList.replaceChildren();
  (product.features || []).forEach((feature) => featureList.append(create('li', '', feature)));

  const modal = $('#productModal');
  if (typeof modal.showModal === 'function') modal.showModal();
}

function closeModal() {
  const modal = $('#productModal');
  if (modal.open) modal.close();
}

function observeReveals() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $$('.reveal').forEach((element) => element.classList.add('visible'));
    return;
  }
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  $$('.reveal:not(.visible)').forEach((element) => observer.observe(element));
}

function wireEvents() {
  $('#menuButton')?.addEventListener('click', () => {
    const nav = $('#mainNav');
    const open = nav.classList.toggle('open');
    $('#menuButton').setAttribute('aria-expanded', String(open));
  });
  $$('#mainNav a').forEach((link) => link.addEventListener('click', () => $('#mainNav').classList.remove('open')));

  $$('.brand-chip').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeBrand = button.dataset.brand || 'all';
      $$('.brand-chip').forEach((item) => item.classList.toggle('active', item === button));
      renderProducts();
      document.getElementById('bats')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  $('#productSearch')?.addEventListener('input', (event) => {
    state.query = event.target.value.trim();
    renderProducts();
  });

  $('#modalClose')?.addEventListener('click', closeModal);
  $('#productModal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  $('#modalWhatsapp')?.addEventListener('click', () => {
    if (!state.selectedProduct) return;
    window.open(whatsappUrl(productWhatsAppMessage(state.selectedProduct)), '_blank', 'noopener');
  });
}

async function init() {
  wireEvents();
  observeReveals();
  try {
    const response = await fetch('/api/site', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load website data.');
    const data = await response.json();
    applySettings(data.settings);
    state.products = Array.isArray(data.products) ? data.products : [];
    renderProducts();
  } catch (error) {
    console.error(error);
    const grid = $('#productGrid');
    grid.replaceChildren(create('div', 'empty-state', 'The catalogue could not load. Please refresh the page or contact us on WhatsApp.'));
  }
}

document.addEventListener('DOMContentLoaded', init);
