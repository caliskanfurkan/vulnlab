const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db, publicUser } = require('../db');

const router = express.Router();

function view(res, name, data = {}) {
  res.render(name, { user: publicUser(res.req.user), storeName: config.STORE_NAME, version: config.VERSION, ...data });
}

function requireLogin(req, res, next) {
  if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  next();
}

router.get('/', (req, res) => {
  const categories = db.prepare('SELECT category, COUNT(*) AS count FROM products WHERE published = 1 GROUP BY category ORDER BY category').all();
  view(res, 'index.njk', { categories, q: req.query.q || '', category: req.query.category || '' });
});

router.get('/products/:id', (req, res) => {
  const product = db
    .prepare('SELECT p.*, u.name AS vendor_name FROM products p LEFT JOIN users u ON u.id = p.vendor_id WHERE p.id = ? AND p.published = 1')
    .get(Number(req.params.id));
  if (!product) return res.status(404).render('404.njk', { user: publicUser(req.user), storeName: config.STORE_NAME });
  const reviews = db
    .prepare('SELECT r.*, u.name AS user_name FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? ORDER BY r.created_at DESC, r.id DESC')
    .all(product.id);
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
  view(res, 'product.njk', { product, reviews, avg });
});

router.get('/cart', (req, res) => view(res, 'cart.njk'));
router.get('/orders', requireLogin, (req, res) => view(res, 'orders.njk'));
router.get('/orders/:id', requireLogin, (req, res) => view(res, 'order.njk', { orderId: Number(req.params.id) }));
router.get('/account', requireLogin, (req, res) => view(res, 'account.njk'));
router.get('/admin', requireLogin, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).render('error.njk', { user: publicUser(req.user), storeName: config.STORE_NAME, title: 'Erişim engellendi', message: 'Bu sayfa yalnızca yöneticiler için.' });
  view(res, 'admin.njk');
});
router.get('/vendor', requireLogin, (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).render('error.njk', { user: publicUser(req.user), storeName: config.STORE_NAME, title: 'Satıcı paneli', message: 'Satıcı paneline erişmek için onaylı bir satıcı hesabı gerekir.' });
  view(res, 'vendor.njk');
});

router.get('/login', (req, res) => view(res, 'login.njk', { next: req.query.next || '/' }));
router.get('/register', (req, res) => view(res, 'register.njk'));
router.get('/forgot', (req, res) => view(res, 'forgot.njk'));
router.get('/reset', (req, res) => view(res, 'reset.njk', { token: req.query.token || '' }));
router.get('/logout', (req, res) => {
  res.clearCookie('session', { path: '/' });
  res.redirect('/');
});

// Fatura ve katalog dosyalari
router.get('/download', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Oturum gerekli' });
  const requested = String(req.query.f || '');
  if (!requested) return res.status(400).json({ error: 'f parametresi gerekli' });
  if (path.isAbsolute(requested)) return res.status(400).json({ error: 'Geçersiz dosya yolu' });

  const sanitized = requested.replace(/\.\.\//g, '');
  const full = path.join(config.STORAGE_DIR, sanitized);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return res.status(404).json({ error: 'Dosya bulunamadı' });

  const ext = path.extname(full).toLowerCase();
  const types = { '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
  res.set('Content-Type', types[ext] || 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename="${path.basename(full)}"`);
  res.send(fs.readFileSync(full));
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(['User-agent: *', 'Disallow: /api/v1/', 'Disallow: /internal/', 'Disallow: /admin', 'Disallow: /account', 'Disallow: /cart', '', 'Sitemap: /sitemap.xml'].join('\n'));
});

router.get('/sitemap.xml', (req, res) => {
  const products = db.prepare('SELECT id FROM products WHERE published = 1').all();
  const base = `${req.protocol}://${req.get('host')}`;
  const urls = ['/', '/login', '/register', ...products.map((p) => `/products/${p.id}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join('\n')}\n</urlset>`);
});

module.exports = router;
