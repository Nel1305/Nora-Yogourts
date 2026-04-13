/* ═══════════════════════════════════════════════
   BOUTIQUE — shop.js
   Page cliente : catalogue + panier + commande
═══════════════════════════════════════════════ */

'use strict';

let allProducts  = [];
let activeFilter = 'all';
let cart         = {};        /* { id: { product, qty, note } } */
let shopSettings = {};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  showLoader(true);
  await Promise.all([loadSettings(), loadProducts()]);
  showLoader(false);
  initFilters();
  initCartEvents();
  initCheckoutForm();
  loadCartFromSession();
  updateCartUI();
});

/* ── THEME DYNAMIQUE ── */
async function loadSettings() {
  shopSettings = await dbGetSettings();
  applyTheme(shopSettings);
  renderHero(shopSettings);
  document.title = shopSettings.shop_name || 'Ma Boutique';
}

function applyTheme(s) {
  const primary = s.color_primary || '#C9845A';
  /* Calcul automatique des variantes */
  const dark  = shadeColor(primary, -20);
  const light = shadeColor(primary, +30);
  const root  = document.documentElement;
  root.style.setProperty('--primary',       primary);
  root.style.setProperty('--primary-dark',  dark);
  root.style.setProperty('--primary-light', light);
  root.style.setProperty('--primary-dim',   hexToRgba(primary, .12));
  root.style.setProperty('--primary-glow',  hexToRgba(primary, .28));
}

function renderHero(s) {
  const heroEl = document.getElementById('hero');
  if (!heroEl) return;
  const name   = esc(s.shop_name   || 'Ma Boutique');
  const slogan = esc(s.shop_slogan || '');
  const logo   = s.logo_url;
  heroEl.innerHTML = `
    <div class="hero-content">
      ${logo
        ? `<img src="${esc(logo)}" alt="${name}" class="hero-logo">`
        : `<div class="hero-logo-placeholder">${name[0]?.toUpperCase() || 'B'}</div>`}
      <div class="hero-name">${name}</div>
      ${slogan ? `<div class="hero-slogan">${slogan}</div>` : ''}
    </div>`;
}

/* ── COULEURS HELPERS ── */
function shadeColor(hex, pct) {
  const num = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(255 * pct / 100)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(255 * pct / 100)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(255 * pct / 100)));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function hexToRgba(hex, alpha) {
  const num = parseInt(hex.replace('#',''), 16);
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── PRODUITS ── */
async function loadProducts() {
  allProducts = await dbGetProducts(true);
  renderCategoryTabs();
  renderGrid();
}

function renderCategoryTabs() {
  const cats = ['all', ...new Set(allProducts.map(p => p.cat).filter(Boolean))];
  const el   = document.getElementById('catTabs');
  if (!el) return;
  el.innerHTML = cats.map(c => `
    <button class="cat-tab ${c === activeFilter ? 'active' : ''}" data-filter="${esc(c)}">
      ${c === 'all' ? 'Tout' : esc(c)}
    </button>`).join('');
  el.querySelectorAll('.cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      el.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGrid();
    });
  });
}

function renderGrid() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;
  const list = activeFilter === 'all'
    ? allProducts
    : allProducts.filter(p => p.cat === activeFilter);

  if (!list.length) {
    grid.innerHTML = '<div class="empty-grid">Aucun produit disponible pour le moment.</div>';
    return;
  }

  grid.innerHTML = list.map(p => {
    const inCart = cart[p.id];
    return `
      <div class="card">
        <div class="card-img">
          ${p.photo
            ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">`
            : `<span class="card-img-placeholder">🛍</span>`}
        </div>
        <div class="card-body">
          ${p.cat ? `<div class="card-cat">${esc(p.cat)}</div>` : ''}
          <div class="card-name">${esc(p.name)}</div>
          ${p.desc ? `<div class="card-desc">${esc(p.desc)}</div>` : ''}
          <div class="card-footer">
            <div class="card-price">${p.price.toLocaleString('fr-FR')} <span>FCFA</span></div>
          </div>
          <div class="card-cart-row">
            ${inCart
              ? `<div class="card-qty-ctrl">
                   <button class="card-qty-btn" onclick="cartDec(${p.id})">−</button>
                   <span class="card-qty-num">${inCart.qty}</span>
                   <button class="card-qty-btn" onclick="cartInc(${p.id})">+</button>
                 </div>`
              : `<button class="btn-add" onclick="cartAdd(${p.id})">+ Ajouter au panier</button>`}
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ── PANIER ── */
function cartAdd(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  if (cart[productId]) cart[productId].qty += 1;
  else cart[productId] = { product: p, qty: 1, note: '' };
  saveCart();
  renderGrid();
  updateCartUI();
  renderCartDrawer();
  showToast('Ajouté !', p.name + ' — ' + (p.price * cart[productId].qty).toLocaleString('fr-FR') + ' FCFA');
}
function cartInc(productId) {
  if (!cart[productId]) return;
  cart[productId].qty += 1;
  saveCart(); renderGrid(); updateCartUI(); renderCartDrawer();
}
function cartDec(productId) {
  if (!cart[productId]) return;
  cart[productId].qty -= 1;
  if (cart[productId].qty <= 0) delete cart[productId];
  saveCart(); renderGrid(); updateCartUI(); renderCartDrawer();
}
function cartRemove(productId) {
  delete cart[productId];
  saveCart(); renderGrid(); updateCartUI(); renderCartDrawer();
}
function clearCart() {
  cart = {};
  saveCart(); renderGrid(); updateCartUI(); renderCartDrawer();
}
function cartSetNote(productId, val) {
  if (cart[productId]) { cart[productId].note = val; saveCart(); }
}
function cartTotal()     { return Object.values(cart).reduce((s,i) => s + i.product.price * i.qty, 0); }
function cartItemCount() { return Object.values(cart).reduce((s,i) => s + i.qty, 0); }
function saveCart()      { try { sessionStorage.setItem('boutique_cart', JSON.stringify(cart)); } catch(_){} }
function loadCartFromSession() {
  try {
    const raw = sessionStorage.getItem('boutique_cart');
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.keys(saved).forEach(id => {
      const p = allProducts.find(x => String(x.id) === id);
      if (p) cart[id] = { ...saved[id], product: p };
    });
  } catch(_) {}
}

function updateCartUI() {
  const count = cartItemCount();
  const total = cartTotal();
  /* FAB */
  const fab   = document.getElementById('cartFab');
  if (fab)    fab.classList.toggle('visible', count > 0);
  const badge = document.getElementById('cartFabBadge');
  if (badge)  badge.textContent = count;
  /* Drawer total */
  const tot = document.getElementById('cartDrawerTotal');
  if (tot)   tot.textContent = total.toLocaleString('fr-FR') + ' FCFA';
  /* Count pill */
  const pill = document.getElementById('cartCountPill');
  if (pill)  pill.textContent = count;
  /* Footer */
  const footer = document.getElementById('cartFooter');
  if (footer) footer.style.display = count > 0 ? '' : 'none';
}

function renderCartDrawer() {
  const items  = Object.values(cart);
  const emptyEl = document.getElementById('cartEmpty');
  const itemsEl = document.getElementById('cartItems');
  if (!emptyEl || !itemsEl) return;
  if (!items.length) {
    emptyEl.style.display = '';
    itemsEl.innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';
  itemsEl.innerHTML = items.map(({ product: p, qty, note }) => `
    <div class="cart-item">
      <div class="cart-item-img">
        ${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : '🛍'}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${esc(p.name)}</div>
        <div class="cart-item-price">${(p.price * qty).toLocaleString('fr-FR')} FCFA</div>
        <input class="cart-item-note" type="text" placeholder="Précision (optionnel)…"
          value="${esc(note)}" maxlength="200"
          oninput="cartSetNote(${p.id}, this.value)"
          aria-label="Note pour ${esc(p.name)}">
      </div>
      <div class="cart-item-ctrl">
        <button class="ctrl-btn" onclick="cartInc(${p.id})">+</button>
        <span class="ctrl-qty">${qty}</span>
        <button class="ctrl-btn" onclick="cartDec(${p.id})">−</button>
        <button class="ctrl-del" onclick="cartRemove(${p.id})" aria-label="Supprimer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`).join('');
  updateCartUI();
}

function initCartEvents() {
  document.getElementById('cartFab')?.addEventListener('click', openCart);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
  document.getElementById('cartCloseBtn')?.addEventListener('click', closeCart);
  document.getElementById('cartClearBtn')?.addEventListener('click', () => { clearCart(); closeCart(); });
  document.getElementById('checkoutBtn')?.addEventListener('click', () => { closeCart(); openCheckout(); });
}

function openCart() {
  renderCartDrawer();
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('cartOverlay')?.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('cartOverlay')?.classList.remove('show');
  document.body.style.overflow = '';
}

/* ── CHECKOUT ── */
function openCheckout() {
  if (!Object.keys(cart).length) {
    showToast('Panier vide', 'Ajoute des produits avant de commander.', '#E05050'); return;
  }
  renderCheckoutSummary();
  openModal('checkoutModal');
}

function renderCheckoutSummary() {
  const items = Object.values(cart);
  const el    = document.getElementById('checkoutSummary');
  if (!el) return;
  el.innerHTML = items.map(({ product: p, qty }) => `
    <div class="checkout-item-row">
      <span class="checkout-item-name">${qty}× ${esc(p.name)}</span>
      <span class="checkout-item-price">${(p.price * qty).toLocaleString('fr-FR')} FCFA</span>
    </div>`).join('') + `
    <div class="checkout-total-row">
      <span>Total</span>
      <span class="checkout-total-amount">${cartTotal().toLocaleString('fr-FR')} FCFA</span>
    </div>`;
}

function initCheckoutForm() {
  document.getElementById('confirmOrderBtn')?.addEventListener('click', submitOrder);
}

async function submitOrder() {
  const name    = document.getElementById('cName').value.trim();
  const phone   = document.getElementById('cPhone').value.trim();
  const address = document.getElementById('cAddress').value.trim();
  const notes   = document.getElementById('cNotes').value.trim();

  if (!name)    { showToast('Champ manquant', 'Ton nom est requis.', '#E05050'); return; }
  if (!phone)   { showToast('Champ manquant', 'Ton numéro de téléphone est requis.', '#E05050'); return; }
  if (!address) { showToast('Champ manquant', "Ton adresse de livraison est requise.", '#E05050'); return; }

  const items   = Object.values(cart).map(({ product: p, qty, note }) => ({
    productId: p.id, productName: p.name, qty, price: p.price, note
  }));
  const total     = cartTotal();
  const orderCode = generateOrderCode();

  const btn = document.getElementById('confirmOrderBtn');
  btn.disabled = true; showLoader(true);

  const result = await dbInsertOrder({
    orderCode, clientName: name, clientPhone: phone,
    clientAddress: address, items, total, notes
  });

  showLoader(false); btn.disabled = false;

  if (result.error) { showToast('Erreur', result.error, '#E05050'); return; }

  /* Fermer le modal checkout */
  closeModal('checkoutModal');

  /* Afficher le reçu */
  showReceipt(result.order, items, total);

  /* Reset */
  clearCart();
  ['cName','cPhone','cAddress','cNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

/* ── REÇU ── */
function showReceipt(order, items, total) {
  const modal = document.getElementById('receiptModal');
  if (!modal) return;

  document.getElementById('receiptCode').textContent  = order.orderCode;
  document.getElementById('receiptTotal').textContent = total.toLocaleString('fr-FR') + ' FCFA';
  document.getElementById('receiptItems').innerHTML   = items.map(i =>
    `<div class="checkout-item-row">
       <span class="checkout-item-name">${i.qty}× ${esc(i.productName)}</span>
       <span class="checkout-item-price">${(i.price * i.qty).toLocaleString('fr-FR')} FCFA</span>
     </div>`).join('');

  openModal('receiptModal');

  window.currentReceiptData = { order, items, total, settings: shopSettings };

  /* Bouton téléchargement */
  document.getElementById('downloadReceiptBtn')?.addEventListener('click', () => downloadReceipt(window.currentReceiptData), { once: true });
}

/* ── TICKET PNG ── */
function downloadReceipt(data) {
  if (!data) return;
  const { order, items, total, settings: s } = data;
  const W = 460, H = 80 + items.length * 28 + 240;
  const canvas  = document.createElement('canvas');
  canvas.width  = W * 2; canvas.height = H * 2;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const primary = s.color_primary || '#C9845A';
  const name    = s.shop_name || 'Ma Boutique';

  /* Fond blanc */
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  /* Bande couleur haut */
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, W, 8);

  /* Logo texte */
  ctx.fillStyle = primary;
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name.toUpperCase(), W/2, 36);

  ctx.fillStyle = '#888';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText('REÇU DE COMMANDE', W/2, 54);

  /* Séparateur */
  ctx.setLineDash([5,4]);
  ctx.strokeStyle = '#DDD';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(28, 66); ctx.lineTo(W-28, 66); ctx.stroke();
  ctx.setLineDash([]);

  /* Code commande */
  ctx.fillStyle = '#1A1410';
  ctx.font = 'bold 26px Courier New, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(order.orderCode, W/2, 100);
  ctx.fillStyle = '#AAA';
  ctx.font = '10px Arial';
  ctx.fillText('CODE DE COMMANDE', W/2, 116);

  /* Séparateur */
  ctx.setLineDash([5,4]);
  ctx.strokeStyle = '#DDD';
  ctx.beginPath(); ctx.moveTo(28, 128); ctx.lineTo(W-28, 128); ctx.stroke();
  ctx.setLineDash([]);

  /* Articles */
  function rowLine(label, val, y, bold = false) {
    ctx.textAlign = 'left';
    ctx.fillStyle = bold ? '#1A1410' : '#555';
    ctx.font = (bold ? 'bold ' : '') + '12px Arial';
    let l = String(label); if (l.length > 30) l = l.slice(0,28)+'…';
    ctx.fillText(l, 36, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = bold ? primary : '#333';
    ctx.font = (bold ? 'bold ' : '') + '12px Arial';
    ctx.fillText(val, W-36, y);
  }

  let y = 148;
  items.forEach(i => {
    rowLine(i.qty + '×  ' + i.productName, (i.price * i.qty).toLocaleString('fr-FR') + ' FCFA', y);
    y += 24;
  });

  /* Total */
  ctx.setLineDash([5,4]);
  ctx.strokeStyle = '#DDD';
  ctx.beginPath(); ctx.moveTo(28, y+4); ctx.lineTo(W-28, y+4); ctx.stroke();
  ctx.setLineDash([]);
  rowLine('TOTAL', total.toLocaleString('fr-FR') + ' FCFA', y + 24, true);

  /* Infos client */
  y += 50;
  ctx.setLineDash([5,4]);
  ctx.strokeStyle = '#DDD';
  ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(W-28, y); ctx.stroke();
  ctx.setLineDash([]);

  rowLine('Client', order.clientName, y + 20);
  rowLine('Téléphone', order.clientPhone, y + 40);

  /* Message de contact */
  y += 64;
  ctx.fillStyle = '#1A1410';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Nous vous contacterons dans les plus brefs délais.', W/2, y);
  ctx.fillStyle = '#AAA';
  ctx.font = '10px Arial';
  ctx.fillText('Pointe-Noire · Congo-Brazzaville', W/2, y + 16);

  /* Bande couleur bas */
  ctx.fillStyle = primary;
  ctx.fillRect(0, H-8, W, 8);

  /* Download */
  const link = document.createElement('a');
  link.download = 'recu-' + order.orderCode + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Reçu téléchargé', order.orderCode + '.png ✓');
}
