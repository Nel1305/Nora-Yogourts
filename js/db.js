/* ═══════════════════════════════════════════════
   BOUTIQUE — db.js
   Base de données Supabase
═══════════════════════════════════════════════ */

'use strict';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── SESSION ADMIN ── */
function getAdminSession()   { return JSON.parse(localStorage.getItem('boutique_admin') || 'null'); }
function setAdminSession(u)  { localStorage.setItem('boutique_admin', JSON.stringify(u)); }
function clearAdminSession() { localStorage.removeItem('boutique_admin'); }

/* ── ADMIN LOGIN ── */
async function dbAdminLogin(email, pass) {
  const { data, error } = await db.from('admin').select('*').eq('email', email.trim()).maybeSingle();
  if (error) return { error: error.message };
  if (!data)  return { error: 'Email ou mot de passe incorrect.' };
  const hash = btoa(unescape(encodeURIComponent(pass)));
  if (data.password !== hash) return { error: 'Email ou mot de passe incorrect.' };
  return { admin: data };
}

async function dbUpdateAdminPassword(id, newPass) {
  const hash = btoa(unescape(encodeURIComponent(newPass)));
  const { error } = await db.from('admin').update({ password: hash }).eq('id', id);
  return error ? { error: error.message } : { ok: true };
}

/* ── BOUTIQUE SETTINGS ── */
async function dbGetSettings() {
  const { data } = await db.from('settings').select('*').eq('id', 1).maybeSingle();
  return data || {};
}

async function dbSaveSettings(fields) {
  /* Upsert — crée ou met à jour la ligne id=1 */
  const { error } = await db.from('settings').upsert({ id: 1, ...fields });
  return error ? { error: error.message } : { ok: true };
}

/* ── PRODUITS ── */
async function dbGetProducts(onlyAvailable = false) {
  let q = db.from('products').select('*').order('position', { ascending: true }).order('created_at', { ascending: false });
  if (onlyAvailable) q = q.eq('available', true);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(np);
}

async function dbInsertProduct(f) {
  const { data, error } = await db.from('products').insert({
    name: f.name, description: f.desc || '',
    category: f.cat, price: f.price,
    photo_url: f.photo || null, available: true,
    position: f.position || 0
  }).select().single();
  if (error) return { error: error.message };
  return { product: np(data) };
}

async function dbUpdateProduct(id, f) {
  const p = {};
  if (f.name      !== undefined) p.name        = f.name;
  if (f.desc      !== undefined) p.description = f.desc;
  if (f.cat       !== undefined) p.category    = f.cat;
  if (f.price     !== undefined) p.price       = f.price;
  if (f.photo     !== undefined) p.photo_url   = f.photo;
  if (f.available !== undefined) p.available   = f.available;
  if (f.position  !== undefined) p.position    = f.position;
  const { data, error } = await db.from('products').update(p).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { product: np(data) };
}

async function dbDeleteProduct(id) {
  const { error } = await db.from('products').delete().eq('id', id);
  return error ? { error: error.message } : { ok: true };
}

function np(r) {
  return {
    id: r.id, name: r.name, desc: r.description,
    cat: r.category, price: r.price, photo: r.photo_url,
    available: r.available, position: r.position || 0,
    createdAt: r.created_at
  };
}

/* ── COMMANDES ── */
async function dbInsertOrder(f) {
  const { data, error } = await db.from('orders').insert({
    order_code:    f.orderCode,
    client_name:   f.clientName,
    client_phone:  f.clientPhone,
    client_address: f.clientAddress,
    items:         JSON.stringify(f.items),
    total:         f.total,
    notes:         f.notes || '',
    status:        'new'
  }).select().single();
  if (error) return { error: error.message };
  return { order: no(data) };
}

async function dbGetOrders(status) {
  let q = db.from('orders').select('*').order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(no);
}

async function dbUpdateOrderStatus(id, status) {
  const { error } = await db.from('orders').update({ status }).eq('id', id);
  return error ? { error: error.message } : { ok: true };
}

function no(r) {
  return {
    id: r.id, orderCode: r.order_code,
    clientName: r.client_name, clientPhone: r.client_phone,
    clientAddress: r.client_address,
    items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
    total: r.total, notes: r.notes,
    status: r.status, createdAt: r.created_at
  };
}

/* ── CHAT ── */
async function dbGetMessages(orderCode) {
  const { data } = await db.from('messages')
    .select('*')
    .eq('order_code', orderCode)
    .order('created_at', { ascending: true })
    .limit(100);
  return data || [];
}

async function dbSendMessage(orderCode, sender, text) {
  const { error } = await db.from('messages').insert({
    order_code: orderCode, sender, text
  });
  return error ? { error: error.message } : { ok: true };
}

/* ── SHARED UI ── */
function showToast(title, msg, color) {
  const t = document.getElementById('toast');
  if (!t) return;
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent   = msg || '';
  t.style.borderLeftColor = color || 'var(--primary)';
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3800);
}

function showLoader(v) {
  const el = document.getElementById('loader');
  if (el) el.style.display = v ? 'flex' : 'none';
}

function openModal(id)  {
  document.getElementById(id)?.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('show');
  document.body.style.overflow = '';
}

function formatDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function statusLabel(s) {
  return { new: 'Nouvelle', confirmed: 'Confirmée', delivered: 'Livrée', cancelled: 'Annulée' }[s] || s;
}

function generateOrderCode() {
  const now  = new Date();
  const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
  return 'CMD-' + yymm + '-' + rand;
}

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

/* Init modals */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.overlay.show').forEach(ov => closeModal(ov.id));
  });
});
