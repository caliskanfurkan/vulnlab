const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const flags = require('../flags');
const { db, settings } = require('../db');
const { requireAuth, requireRole, tokenFrom } = require('../auth');

const router = express.Router();

// ---- Yonetim ----
router.get('/admin/stats', requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const orders = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS revenue FROM orders').get();
  const products = db.prepare('SELECT COUNT(*) AS c FROM products WHERE published = 1').get().c;
  const reviews = db.prepare('SELECT COUNT(*) AS c FROM reviews').get().c;
  res.json({ users, orders: orders.c, revenue: orders.revenue, products, reviews });
});

router.get('/admin/users', requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT id, email, name, role, credit, otp_enabled, created_at FROM users ORDER BY id').all();
  res.json({ users: rows });
});

router.get('/admin/orders', requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT o.id, o.user_id, u.email, o.total, o.status, o.created_at FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 50').all();
  res.json({ orders: rows });
});

router.get('/admin/coupons', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, code, discount_pct, active, audience, internal_note FROM coupons ORDER BY id').all();
  res.json({ coupons: rows });
});

// ---- Satici paneli ----
router.get('/vendor/dashboard', requireRole('vendor'), (req, res) => {
  const products = db.prepare('SELECT id, name, price, stock, category FROM products WHERE vendor_id = ? ORDER BY id').all(req.user.id);
  const sales = db
    .prepare('SELECT COALESCE(SUM(i.qty), 0) AS units, COALESCE(SUM(i.qty * i.price), 0) AS revenue FROM order_items i JOIN products p ON p.id = i.product_id WHERE p.vendor_id = ?')
    .get(req.user.id);
  res.json({
    store_name: req.user.name,
    status: products.length ? 'active' : 'onboarding',
    marketplace: {
      api_base: '/api/v2/vendor',
      api_key: flags.mass,
      docs: 'https://partner.pusula-store.com/docs',
    },
    products,
    sales,
  });
});

// ---- Raporlama ----
// Raporlama servisi API gateway arkasinda calisir; token dogrulamasi gateway'de yapilir.
function reportAuth(req, res, next) {
  const token = tokenFrom(req);
  if (!token) return res.status(401).json({ error: 'Oturum gerekli' });
  const payload = jwt.decode(token);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Raporlara yalnızca yöneticiler erişebilir' });
  req.reportUser = payload;
  next();
}

router.get('/reports/summary', reportAuth, (req, res) => {
  const period = String(req.query.period || '30d');
  const totals = db.prepare('SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue FROM orders').get();
  const top = db
    .prepare('SELECT name, SUM(qty) AS units, SUM(qty * price) AS revenue FROM order_items GROUP BY product_id ORDER BY revenue DESC LIMIT 5')
    .all();
  res.json({
    period,
    generated_for: req.reportUser.email,
    generated_at: new Date().toISOString(),
    orders: totals.orders,
    revenue: totals.revenue,
    top_products: top,
    classification: 'internal',
    audit_reference: flags.jwt,
  });
});

// ---- Ic ag saglik ucu (yalnizca loopback) ----
const internal = express.Router();

internal.use((req, res, next) => {
  const ip = req.socket.remoteAddress || '';
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
  if (!loopback) return res.status(403).json({ error: 'Bu uç nokta yalnızca iç ağdan erişilebilir', client: ip });
  next();
});

internal.get('/health', (req, res) => {
  res.json({
    service: 'pusula-store',
    version: config.VERSION,
    uptime_seconds: Math.round(process.uptime()),
    database: 'ok',
    config: {
      payment_provider: settings.payment_provider,
      store_name: settings.store_name,
      internal_api_key: flags.ssrf,
    },
  });
});

internal.get('/metrics', (req, res) => {
  const orders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  res.type('text/plain').send(`pusula_orders_total ${orders}\npusula_uptime_seconds ${Math.round(process.uptime())}\n`);
});

module.exports = { router, internal };
