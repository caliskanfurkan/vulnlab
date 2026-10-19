const express = require('express');
const { db, insert } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const SORTS = {
  featured: 'featured DESC, id ASC',
  price_asc: 'price ASC',
  price_desc: 'price DESC',
  name: 'name COLLATE NOCASE ASC',
  newest: 'id DESC',
};

router.get('/products', (req, res) => {
  const { q, category, sort } = req.query;
  let sql = 'SELECT id, name, description, price, category, image, stock, is_digital FROM products WHERE published = 1';
  const params = [];

  if (q) {
    const term = String(q);
    sql += ` AND (name LIKE '%${term}%' OR description LIKE '%${term}%')`;
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(String(category));
  }
  sql += ` ORDER BY ${SORTS[sort] || SORTS.featured}`;

  const rows = db.prepare(sql).all(...params);
  res.json({ count: rows.length, products: rows });
});

router.get('/products/categories', (req, res) => {
  const rows = db.prepare('SELECT category, COUNT(*) AS count FROM products WHERE published = 1 GROUP BY category ORDER BY category').all();
  res.json({ categories: rows });
});

router.get('/products/:id', (req, res) => {
  const product = db
    .prepare('SELECT p.id, p.name, p.description, p.price, p.category, p.image, p.stock, p.is_digital, u.name AS vendor_name FROM products p LEFT JOIN users u ON u.id = p.vendor_id WHERE p.id = ? AND p.published = 1')
    .get(Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' });
  res.json(product);
});

router.get('/products/:id/reviews', (req, res) => {
  const rows = db
    .prepare('SELECT r.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? ORDER BY r.created_at DESC, r.id DESC')
    .all(Number(req.params.id));
  const reviews = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    status: r.status,
    moderation_note: r.moderation_note,
    created_at: r.created_at,
    user: { id: r.user_id, name: r.user_name, email: r.user_email, phone: r.user_phone },
  }));
  res.json({ count: reviews.length, reviews });
});

router.post('/products/:id/reviews', requireAuth, (req, res) => {
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT id FROM products WHERE id = ? AND published = 1').get(productId);
  if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' });

  const rating = Number((req.body || {}).rating);
  const body = String((req.body || {}).body || '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Puan 1-5 arasında olmalı' });
  if (body.length < 5 || body.length > 2000) return res.status(400).json({ error: 'Yorum 5-2000 karakter arasında olmalı' });

  const result = insert('reviews', { product_id: productId, user_id: req.user.id, rating, body, status: 'approved' });
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

module.exports = router;
