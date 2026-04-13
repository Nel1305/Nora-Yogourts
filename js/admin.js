/* ═══════════════════════════════════════════════
   BOUTIQUE — admin.js
   Espace vendeuse : produits, commandes,
   personnalisation, chat
═══════════════════════════════════════════════ */

'use strict';

let adminData     = null;
let allProducts   = [];
let allOrders     = [];
let chatOrderCode = null;
let chatSub       = null;

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  /* Vérifier session */
  adminData = getAdminSession();
  if (!adminData) {
    document.getElementById('loginScreen').style.display = '';
    document.getElementById('appShell').style.display    = 'none';
    initLoginForm();
    return;
  }
  bootAdmin();
});

async function bootAdmin() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display    = '';
  showLoader(true);
  const settings = await dbGetSettings();
  applyAdminTheme(settings);
  document.getElementById('sidebarShopName').textContent = settings.shop_name || 'Ma Boutique';
  await renderDashboard();
  showLoader(false);
  initNav();
  initModals();
}

/* ── THÈME ADMIN ── */
function applyAdminTheme(s) {
  const primary = s.color_primary || '#C9845A';
  function shade(hex, pct) {
    const n=parseInt(hex.replace('#',''),16);
    const r=Math.min(255,Math.max(0,(n>>16)+Math.round(255*pct/100)));
    const g=Math.min(255,Math.max(0,((n>>8)&0xff)+Math.round(255*pct/100)));
    const b=Math.min(255,Math.max(0,(n&0xff)+Math.round(255*pct/100)));
    return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
  }
  function rgba(hex,a){const n=parseInt(hex.replace('#',''),16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;}
  const root = document.documentElement;
  root.style.setProperty('--primary',      primary);
  root.style.setProperty('--primary-dark', shade(primary,-20));
  root.style.setProperty('--primary-light',shade(primary,+30));
  root.style.setProperty('--primary-dim',  rgba(primary,.12));
  root.style.setProperty('--primary-glow', rgba(primary,.28));
}

/* ── LOGIN ── */
function initLoginForm() {
  document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('lEmail').value.trim();
    const pass  = document.getElementById('lPass').value;
    if (!email || !pass) { showToast('Champs manquants','Email et mot de passe requis.','var(--red)'); return; }
    showLoader(true);
    const r = await dbAdminLogin(email, pass);
    showLoader(false);
    if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
    setAdminSession(r.admin);
    adminData = r.admin;
    bootAdmin();
  });
  document.getElementById('lPass')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginBtn')?.click();
  });
}

/* ── NAV ── */
function initNav() {
  document.querySelectorAll('.admin-nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => goPage(btn.dataset.page));
  });
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    clearAdminSession(); location.reload();
  });
}

function goPage(name) {
  document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.admin-nav-item[data-page="${name}"]`)?.classList.add('active');
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name)?.classList.add('active');
  if (name === 'dashboard')  renderDashboard();
  if (name === 'products')   renderProductsTable();
  if (name === 'orders')     renderOrdersTable();
  if (name === 'theme')      renderThemePage();
  if (name === 'chat')       initChatPage();
}

/* ── DASHBOARD ── */
async function renderDashboard() {
  const [products, orders] = await Promise.all([dbGetProducts(), dbGetOrders()]);
  allProducts = products; allOrders = orders;
  const total   = orders.reduce((s,o) => s + (o.total||0), 0);
  const newOrd  = orders.filter(o => o.status === 'new').length;
  const statsEl = document.getElementById('dashStats');
  if (statsEl) {
    statsEl.innerHTML = [
      { label: 'Commandes totales', val: orders.length,   color: '' },
      { label: 'Nouvelles',          val: newOrd,          color: '' },
      { label: 'Chiffre d\'affaires', val: total.toLocaleString('fr-FR') + ' FCFA', color: '' },
      { label: 'Produits en ligne',  val: products.filter(p=>p.available).length, color: '' },
    ].map(s => `
      <div class="stat-card">
        <div class="stat-value">${s.val}</div>
        <div class="stat-label">${s.label}</div>
      </div>`).join('');
  }
  /* Dernières commandes */
  const recentEl = document.getElementById('dashRecentOrders');
  if (recentEl) {
    const recent = orders.slice(0, 5);
    recentEl.innerHTML = recent.length
      ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Code</th><th>Client</th><th>Total</th><th>Statut</th></tr></thead>
          <tbody>${recent.map(o => `<tr>
            <td><code style="font-size:.76rem;color:var(--primary)">${esc(o.orderCode)}</code></td>
            <td>${esc(o.clientName)}</td>
            <td style="font-weight:600;color:var(--primary)">${o.total.toLocaleString('fr-FR')} FCFA</td>
            <td><span class="status-badge status-${o.status}">${statusLabel(o.status)}</span></td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : '<p style="color:var(--t3);font-size:.84rem">Aucune commande pour l\'instant.</p>';
  }
}

/* ── PRODUITS ── */
async function renderProductsTable() {
  showLoader(true);
  allProducts = await dbGetProducts();
  showLoader(false);
  const tbody = document.getElementById('productsBody');
  if (!tbody) return;
  if (!allProducts.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Aucun produit. <a style="color:var(--primary);cursor:pointer" onclick="openAddProduct()">Ajouter →</a></td></tr>`;
    return;
  }
  tbody.innerHTML = allProducts.map(p => `
    <tr>
      <td><div class="prod-thumb">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : '🛍'}</div></td>
      <td>
        <div style="font-weight:600">${esc(p.name)}</div>
        ${p.desc ? `<div style="font-size:.72rem;color:var(--t2);margin-top:2px">${esc(p.desc).substring(0,50)}${p.desc.length>50?'…':''}</div>` : ''}
      </td>
      <td style="color:var(--t2);font-size:.8rem">${esc(p.cat||'—')}</td>
      <td style="font-weight:700;color:var(--primary)">${p.price.toLocaleString('fr-FR')} FCFA</td>
      <td>
        <div class="toggle-wrap">
          <button class="toggle ${p.available?'on':''}" onclick="toggleAvailable(${p.id},${!p.available})"></button>
          <span style="font-size:.76rem;color:var(--t2)">${p.available?'Dispo':'Indispo'}</span>
        </div>
      </td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="icon-btn edit" onclick="openEditProduct(${p.id})" title="Modifier">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn del" onclick="deleteProduct(${p.id})" title="Supprimer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

async function toggleAvailable(id, val) {
  await dbUpdateProduct(id, { available: val });
  renderProductsTable();
}

async function deleteProduct(id) {
  if (!confirm('Supprimer ce produit définitivement ?')) return;
  showLoader(true);
  await dbDeleteProduct(id);
  showLoader(false);
  showToast('Produit supprimé','','var(--red)');
  renderProductsTable();
}

function openAddProduct() {
  document.getElementById('addProductForm')?.reset();
  document.getElementById('apPhotoPreview').style.display = 'none';
  document.getElementById('apPhotoPlaceholder').style.display = '';
  document.getElementById('addProductModal').classList.add('show');
}

async function saveProduct() {
  const name  = document.getElementById('apName').value.trim();
  const cat   = document.getElementById('apCat').value.trim();
  const price = parseInt(document.getElementById('apPrice').value);
  const desc  = document.getElementById('apDesc').value.trim();
  const photo = document.getElementById('apPhotoPreview').src && document.getElementById('apPhotoPreview').style.display !== 'none'
    ? document.getElementById('apPhotoPreview').src : null;

  if (!name)       { showToast('Champ manquant','Nom du produit requis.','var(--red)'); return; }
  if (!price || price < 1) { showToast('Prix invalide','Prix requis.','var(--red)'); return; }

  showLoader(true);
  const r = await dbInsertProduct({ name, cat, price, desc, photo });
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  document.getElementById('addProductModal').classList.remove('show');
  showToast('Produit ajouté', name + ' publié ✓', 'var(--green)');
  renderProductsTable();
}

function openEditProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('editPId').value    = id;
  document.getElementById('editName').value   = p.name;
  document.getElementById('editCat').value    = p.cat || '';
  document.getElementById('editPrice').value  = p.price;
  document.getElementById('editDesc').value   = p.desc || '';
  const prev = document.getElementById('editPhotoPreview');
  if (p.photo) { prev.src = p.photo; prev.style.display = 'block'; }
  else           prev.style.display = 'none';
  document.getElementById('editProductModal').classList.add('show');
}

async function saveEditProduct() {
  const id    = parseInt(document.getElementById('editPId').value);
  const name  = document.getElementById('editName').value.trim();
  const cat   = document.getElementById('editCat').value.trim();
  const price = parseInt(document.getElementById('editPrice').value);
  const desc  = document.getElementById('editDesc').value.trim();
  const prev  = document.getElementById('editPhotoPreview');
  const photo = prev.style.display !== 'none' ? prev.src : null;

  if (!name)       { showToast('Champ manquant','Nom requis.','var(--red)'); return; }
  if (!price || price < 1) { showToast('Prix invalide','','var(--red)'); return; }

  showLoader(true);
  const r = await dbUpdateProduct(id, { name, cat, price, desc, photo });
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  document.getElementById('editProductModal').classList.remove('show');
  showToast('Produit modifié', name + ' mis à jour ✓');
  renderProductsTable();
}

/* Photo upload helper */
function handlePhotoUpload(inputId, previewId, placeholderId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Fichier trop lourd','Max 5 Mo.','var(--red)'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const prev  = document.getElementById(previewId);
      const place = document.getElementById(placeholderId);
      prev.src          = e.target.result;
      prev.style.display = 'block';
      if (place) place.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });
}

/* ── COMMANDES ── */
async function renderOrdersTable(statusFilter) {
  showLoader(true);
  allOrders = await dbGetOrders(statusFilter);
  showLoader(false);
  const tbody = document.getElementById('ordersBody');
  if (!tbody) return;
  if (!allOrders.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Aucune commande.</td></tr>`; return;
  }
  tbody.innerHTML = allOrders.map(o => `
    <tr>
      <td><code style="font-size:.76rem;color:var(--primary)">${esc(o.orderCode)}</code></td>
      <td>
        <div style="font-weight:600">${esc(o.clientName)}</div>
        <div style="font-size:.72rem;color:var(--t2)">${esc(o.clientPhone)}</div>
      </td>
      <td style="font-size:.78rem;color:var(--t2);max-width:140px">${esc(o.clientAddress)}</td>
      <td style="font-size:.78rem;color:var(--t2)">${(o.items||[]).map(i=>i.qty+'× '+i.productName).join('<br>')}</td>
      <td style="font-weight:700;color:var(--primary)">${o.total.toLocaleString('fr-FR')} FCFA</td>
      <td>
        <select class="select-sm" onchange="updateOrderStatus(${o.id},this.value)">
          <option value="new"       ${o.status==='new'       ?'selected':''}>Nouvelle</option>
          <option value="confirmed" ${o.status==='confirmed' ?'selected':''}>Confirmée</option>
          <option value="delivered" ${o.status==='delivered' ?'selected':''}>Livrée</option>
          <option value="cancelled" ${o.status==='cancelled' ?'selected':''}>Annulée</option>
        </select>
      </td>
      <td>
        <button class="icon-btn edit" onclick="openOrderChat('${esc(o.orderCode)}','${esc(o.clientName)}')" title="Chat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      </td>
    </tr>`).join('');
}

async function updateOrderStatus(id, status) {
  await dbUpdateOrderStatus(id, status);
  showToast('Statut mis à jour', statusLabel(status));
}

/* ── THEME / PERSONNALISATION ── */
async function renderThemePage() {
  const s = await dbGetSettings();
  const primary = s.color_primary || '#C9845A';

  document.getElementById('colorPicker').value   = primary;
  document.getElementById('colorHexInput').value = primary;
  document.getElementById('shopNameInput').value  = s.shop_name   || '';
  document.getElementById('shopSloganInput').value= s.shop_slogan || '';

  if (s.logo_url) {
    const prev = document.getElementById('logoPreview');
    prev.src = s.logo_url; prev.style.display = 'block';
  }
  updateThemePreview(s.shop_name, s.shop_slogan, primary);
}

function updateThemePreview(name, slogan, color) {
  const el = document.getElementById('themePreview');
  if (!el) return;
  el.style.background = color;
  document.getElementById('themePreviewName').textContent   = name   || 'Ma Boutique';
  document.getElementById('themePreviewSlogan').textContent = slogan || 'Ton slogan ici…';
}

function initThemeControls() {
  const picker   = document.getElementById('colorPicker');
  const hexInput = document.getElementById('colorHexInput');
  const nameInp  = document.getElementById('shopNameInput');
  const sloganInp= document.getElementById('shopSloganInput');

  const syncColor = (hex) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    picker.value   = hex;
    hexInput.value = hex;
    updateThemePreview(nameInp.value, sloganInp.value, hex);
  };

  picker.addEventListener('input',   e => syncColor(e.target.value));
  hexInput.addEventListener('input', e => syncColor(e.target.value));
  nameInp.addEventListener('input',  () => updateThemePreview(nameInp.value, sloganInp.value, picker.value));
  sloganInp.addEventListener('input',() => updateThemePreview(nameInp.value, sloganInp.value, picker.value));

  /* Logo upload */
  document.getElementById('logoFileInput')?.addEventListener('change', () => {
    const file = document.getElementById('logoFileInput').files[0];
    if (!file) return;
    if (file.size > 2*1024*1024) { showToast('Fichier trop lourd','Max 2 Mo.','var(--red)'); return; }
    const r = new FileReader();
    r.onload = e => {
      const prev = document.getElementById('logoPreview');
      prev.src = e.target.result; prev.style.display = 'block';
    };
    r.readAsDataURL(file);
  });

  document.getElementById('saveThemeBtn')?.addEventListener('click', saveTheme);
}

async function saveTheme() {
  const color  = document.getElementById('colorPicker').value;
  const name   = document.getElementById('shopNameInput').value.trim();
  const slogan = document.getElementById('shopSloganInput').value.trim();
  const logoEl = document.getElementById('logoPreview');
  const logo   = logoEl.style.display !== 'none' ? logoEl.src : null;

  showLoader(true);
  const r = await dbSaveSettings({ color_primary: color, shop_name: name, shop_slogan: slogan, logo_url: logo });
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  applyAdminTheme({ color_primary: color });
  document.getElementById('sidebarShopName').textContent = name || 'Ma Boutique';
  showToast('Thème sauvegardé', 'Les changements sont visibles sur la boutique ✓', 'var(--green)');
}

/* ── CHAT ── */
async function initChatPage() {
  /* Charger toutes les commandes avec messages */
  const orders = await dbGetOrders();
  renderConversationList(orders);
}

function renderConversationList(orders) {
  const el = document.getElementById('convList');
  if (!el) return;
  if (!orders.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--t3);font-size:.82rem">Aucune commande</div>'; return;
  }
  el.innerHTML = orders.map(o => `
    <div class="chat-conv-item ${chatOrderCode===o.orderCode?'active':''}" onclick="openOrderChat('${esc(o.orderCode)}','${esc(o.clientName)}')">
      <div class="chat-conv-av">${o.clientName[0].toUpperCase()}</div>
      <div>
        <div class="chat-conv-name">${esc(o.clientName)}</div>
        <div class="chat-conv-code">${esc(o.orderCode)}</div>
      </div>
    </div>`).join('');
}

async function openOrderChat(orderCode, clientName) {
  chatOrderCode = orderCode;
  /* Update header */
  document.getElementById('chatHeaderName').textContent = esc(clientName);
  document.getElementById('chatHeaderCode').textContent = orderCode;
  /* Load messages */
  await loadChatMessages();
  /* Realtime */
  if (chatSub) chatSub.unsubscribe();
  chatSub = db.channel('chat-' + orderCode)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:'order_code=eq.'+orderCode }, () => loadChatMessages())
    .subscribe();
}

async function loadChatMessages() {
  if (!chatOrderCode) return;
  const msgs = await dbGetMessages(chatOrderCode);
  const el   = document.getElementById('chatMsgs');
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = '<div class="chat-empty-state"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>Pas encore de messages</p></div>';
    return;
  }
  el.innerHTML = msgs.map(m => {
    const mine = m.sender === 'admin';
    const time = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    return `<div class="chat-msg-wrap ${mine?'mine':''}">
      <div class="chat-av">${mine ? 'M' : m.sender[0]?.toUpperCase() || 'C'}</div>
      <div>
        <div class="chat-bubble">${esc(m.text)}<div class="chat-time">${time}</div></div>
      </div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function initChatSend() {
  const btn   = document.getElementById('chatSendBtn');
  const input = document.getElementById('chatInput');
  async function send() {
    const text = input?.value.trim();
    if (!text || !chatOrderCode) return;
    btn.disabled = true;
    await dbSendMessage(chatOrderCode, 'admin', text);
    input.value = '';
    input.style.height = 'auto';
    btn.disabled = false;
    input.focus();
    loadChatMessages();
  }
  btn?.addEventListener('click', send);
  input?.addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  input?.addEventListener('input', () => { input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,110)+'px'; });
}

/* ── MODALS ── */
function initModals() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.close)?.classList.remove('show');
    });
  });
  document.querySelectorAll('.admin-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('show'); });
  });

  /* Init after DOM ready */
  handlePhotoUpload('apPhoto','apPhotoPreview','apPhotoPlaceholder');
  handlePhotoUpload('editPhoto','editPhotoPreview','editPhotoPlaceholder');
  initThemeControls();
  initChatSend();

  document.getElementById('saveProductBtn')?.addEventListener('click', saveProduct);
  document.getElementById('saveEditBtn')?.addEventListener('click', saveEditProduct);
  document.getElementById('addProductBtn')?.addEventListener('click', openAddProduct);

  document.getElementById('orderStatusFilter')?.addEventListener('change', e => renderOrdersTable(e.target.value));
}

/* ── PASSWORD ── */
async function changePassword() {
  const np = document.getElementById('newPassInput')?.value.trim();
  if (!np || np.length < 6) { showToast('Mot de passe trop court','Min. 6 caractères.','var(--red)'); return; }
  showLoader(true);
  const r = await dbUpdateAdminPassword(adminData.id, np);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  document.getElementById('newPassInput').value = '';
  showToast('Mot de passe mis à jour','✓','var(--green)');
}
