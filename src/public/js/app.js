/* Pusula Store - istemci tarafi yardimcilari */
(function () {
  const TRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

  async function api(path, options = {}) {
    const opts = { credentials: 'same-origin', headers: {}, ...options };
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, opts);
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function gql(query, variables) {
    const res = await fetch('/graphql', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const data = await res.json();
    if (data.errors) throw new Error(data.errors.map((e) => e.message).join(', '));
    return data.data;
  }

  // ---- Sepet (tarayicida tutulur) ----
  const CART_KEY = 'pusula_cart';
  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
  }
  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    renderCartCount();
  }
  function addToCart(product, qty = 1) {
    const cart = getCart();
    const existing = cart.find((i) => i.product_id === product.id);
    if (existing) existing.qty += qty;
    else cart.push({ product_id: product.id, name: product.name, price: product.price, image: product.image, qty });
    saveCart(cart);
    toast(`${product.name} sepete eklendi`);
  }
  function renderCartCount() {
    const el = document.querySelector('[data-cart-count]');
    if (!el) return;
    const n = getCart().reduce((s, i) => s + i.qty, 0);
    el.textContent = n;
    el.style.display = n ? '' : 'none';
  }

  function toast(msg, ms = 2400) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function stars(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function showNotice(container, type, text) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = `<div class="notice ${type}">${escapeHtml(text)}</div>`;
  }

  function productCard(p) {
    return `
      <article class="card">
        <a class="thumb" href="/products/${p.id}"><img src="/static/img/${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}"></a>
        <div class="body">
          <div class="cat">${escapeHtml(p.category)}</div>
          <h3><a href="/products/${p.id}">${escapeHtml(p.name)}</a></h3>
          <div class="price">${TRY.format(p.price)}</div>
          <div class="actions">
            <button class="btn small" data-add='${escapeHtml(JSON.stringify({ id: p.id, name: p.name, price: p.price, image: p.image }))}'>Sepete ekle</button>
            <a class="btn small secondary" href="/products/${p.id}">İncele</a>
          </div>
        </div>
      </article>`;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (btn) {
      addToCart(JSON.parse(btn.getAttribute('data-add')));
    }
  });

  document.addEventListener('DOMContentLoaded', renderCartCount);

  window.Pusula = { api, gql, getCart, saveCart, addToCart, toast, escapeHtml, stars, showNotice, productCard, TRY };
})();
