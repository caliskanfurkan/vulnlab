/* Yonetim ve satici panelleri */
(function () {
  const { api, escapeHtml, TRY } = window.Pusula;

  async function admin() {
    const stats = document.getElementById('stats');
    try {
      const s = await api('/api/v2/admin/stats');
      stats.innerHTML = [['Kullanıcı', s.users], ['Sipariş', s.orders], ['Ciro', TRY.format(s.revenue)], ['Ürün', s.products], ['Yorum', s.reviews]]
        .map(([l, v]) => `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');
    } catch (e) { stats.innerHTML = `<div class="notice error">${escapeHtml(e.message)}</div>`; }

    try {
      const data = await api('/api/v2/admin/users');
      document.getElementById('users').innerHTML = '<table><thead><tr><th>ID</th><th>E-posta</th><th>Ad</th><th>Rol</th><th class="right">Bakiye</th></tr></thead><tbody>' +
        data.users.map(u => `<tr><td>${u.id}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.name)}</td><td><span class="badge">${escapeHtml(u.role)}</span>${u.otp_enabled ? ' <span class="badge ok">2FA</span>' : ''}</td><td class="right">${TRY.format(u.credit)}</td></tr>`).join('') + '</tbody></table>';
    } catch (e) { document.getElementById('users').innerHTML = `<div class="notice error">${escapeHtml(e.message)}</div>`; }

    try {
      const data = await api('/api/v2/admin/orders');
      document.getElementById('orders').innerHTML = '<table><thead><tr><th>Sipariş</th><th>Müşteri</th><th>Durum</th><th class="right">Toplam</th></tr></thead><tbody>' +
        data.orders.map(o => `<tr><td><a href="/orders/${o.id}">INV-${o.id}</a></td><td>${escapeHtml(o.email)}</td><td>${escapeHtml(o.status)}</td><td class="right">${TRY.format(o.total)}</td></tr>`).join('') + '</tbody></table>';
    } catch (e) { document.getElementById('orders').innerHTML = `<div class="notice error">${escapeHtml(e.message)}</div>`; }

    try {
      const data = await api('/api/v2/me/notifications');
      document.getElementById('notifications').innerHTML = data.notifications.map(n => `<div class="notification"><div class="title">${escapeHtml(n.title)}</div><div class="body">${escapeHtml(n.body)}</div><div class="time">${escapeHtml(n.created_at)}</div></div>`).join('') || '<div class="empty">Bildirim yok.</div>';
    } catch (e) { document.getElementById('notifications').innerHTML = `<div class="notice error">${escapeHtml(e.message)}</div>`; }

    try {
      const r = await api('/api/v2/reports/summary?period=30d');
      document.getElementById('report').innerHTML = `<p class="meta">Son ${escapeHtml(r.period)} · ${r.orders} sipariş · ${TRY.format(r.revenue)}</p>` +
        '<table><thead><tr><th>Ürün</th><th class="right">Adet</th><th class="right">Ciro</th></tr></thead><tbody>' +
        r.top_products.map(p => `<tr><td>${escapeHtml(p.name)}</td><td class="right">${p.units}</td><td class="right">${TRY.format(p.revenue)}</td></tr>`).join('') + '</tbody></table>' +
        `<p class="help">Rapor referansı: ${escapeHtml(r.audit_reference)}</p>`;
    } catch (e) { document.getElementById('report').innerHTML = `<div class="notice error">${escapeHtml(e.message)}</div>`; }
  }

  async function vendor() {
    const box = document.getElementById('vendor');
    try {
      const d = await api('/api/v2/vendor/dashboard');
      box.innerHTML = `
        <div class="stats">
          <div class="stat"><div class="label">Mağaza</div><div class="value" style="font-size:18px">${escapeHtml(d.store_name)}</div></div>
          <div class="stat"><div class="label">Durum</div><div class="value" style="font-size:18px">${d.status === 'active' ? '<span class="badge ok">Aktif</span>' : '<span class="badge info">Onboarding</span>'}</div></div>
          <div class="stat"><div class="label">Satılan adet</div><div class="value">${d.sales.units}</div></div>
          <div class="stat"><div class="label">Ciro</div><div class="value">${TRY.format(d.sales.revenue)}</div></div>
        </div>
        <div class="two-col">
          <div class="panel"><h3>Ürünlerim</h3>${d.products.length ? '<table><thead><tr><th>Ürün</th><th>Kategori</th><th class="right">Fiyat</th><th class="right">Stok</th></tr></thead><tbody>' + d.products.map(p => `<tr><td><a href="/products/${p.id}">${escapeHtml(p.name)}</a></td><td>${escapeHtml(p.category)}</td><td class="right">${TRY.format(p.price)}</td><td class="right">${p.stock}</td></tr>`).join('') + '</tbody></table>' : '<div class="empty">Henüz ürün eklemediniz. Ürün yüklemek için pazaryeri API\'sini veya satıcı destek ekibini kullanabilirsiniz.</div>'}</div>
          <div class="panel"><h3>Pazaryeri entegrasyonu</h3>
            <p class="help">API adresi: <code>${escapeHtml(d.marketplace.api_base)}</code></p>
            <p class="help">API anahtarı: <code>${escapeHtml(d.marketplace.api_key)}</code></p>
            <p class="help"><a href="${escapeHtml(d.marketplace.docs)}">Entegrasyon dokümantasyonu</a></p>
          </div>
        </div>`;
    } catch (e) { box.innerHTML = `<div class="panel notice error">${escapeHtml(e.message)}</div>`; }
  }

  window.Pusula.Dashboard = { admin, vendor };
})();
