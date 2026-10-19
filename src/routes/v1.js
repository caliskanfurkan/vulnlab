// Eski mobil uygulama icin tutulan API v1. v2'ye gecis tamamlandiginda kaldirilacak.
const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.use((req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Mar 2025 00:00:00 GMT');
  res.set('Link', '</api/v2>; rel="successor-version"');
  next();
});

router.get('/', (req, res) => {
  res.json({
    version: '1.0',
    status: 'deprecated',
    message: 'Bu API sürümü kullanımdan kaldırılmıştır. Lütfen /api/v2 kullanın.',
    endpoints: ['/api/v1/users', '/api/v1/products', '/api/v1/products/:id'],
  });
});

router.get('/users', (req, res) => {
  const rows = db
    .prepare('SELECT id, email, name, role, legacy_md5 AS password_md5, api_token, otp_enabled, created_at FROM users ORDER BY id')
    .all();
  res.json({ count: rows.length, users: rows });
});

router.get('/products', (req, res) => {
  const rows = db.prepare('SELECT id, name, price, category, stock FROM products WHERE published = 1 ORDER BY id').all();
  res.json({ count: rows.length, products: rows });
});

router.get('/products/:id', (req, res) => {
  const row = db.prepare('SELECT id, name, description, price, category, stock FROM products WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Ürün bulunamadı' });
  res.json(row);
});

module.exports = router;
