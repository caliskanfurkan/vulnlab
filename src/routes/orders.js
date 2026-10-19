const express = require('express');
const { db, insert, getUserById, publicUser, addNotification, writeInvoice } = require('../db');
const { randomCode, sleep, formatTRY } = require('../util');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/orders', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT o.id, o.total, o.status, o.created_at, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count FROM orders o WHERE o.user_id = ? ORDER BY o.id DESC')
    .all(req.user.id);
  res.json({ orders: rows });
});

router.get('/orders/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  const items = db.prepare('SELECT product_id, name, price, qty, license_key FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ ...order, items, invoice: `/download?f=invoices/INV-${order.id}.pdf` });
});

function findCoupon(code, user) {
  if (!code) return null;
  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(String(code).trim().toUpperCase());
  if (!coupon) return null;
  if (coupon.audience === 'staff' && !['staff', 'admin'].includes(user.role)) return null;
  return coupon;
}

router.get('/coupons/:code', requireAuth, (req, res) => {
  const coupon = findCoupon(req.params.code, req.user);
  if (!coupon) return res.status(404).json({ error: 'Geçersiz veya süresi dolmuş kupon' });
  res.json({ code: coupon.code, discount_pct: coupon.discount_pct });
});

router.post('/checkout', requireAuth, (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return res.status(400).json({ error: 'Sepet boş' });
  if (items.length > 20) return res.status(400).json({ error: 'Tek siparişte en fazla 20 kalem olabilir' });

  const address = String(body.address || req.user.address || '').trim();
  if (address.length < 10) return res.status(400).json({ error: 'Teslimat adresi gerekli' });

  const lines = [];
  for (const it of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND published = 1').get(Number(it.product_id));
    if (!product) return res.status(400).json({ error: `Ürün bulunamadı: ${it.product_id}` });
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) return res.status(400).json({ error: `Geçersiz adet: ${product.name}` });
    const price = Number(it.price);
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: `Geçersiz fiyat: ${product.name}` });
    if (!product.is_digital && product.stock < qty) return res.status(400).json({ error: `Yetersiz stok: ${product.name}` });
    lines.push({ product, qty, price });
  }

  const coupon = findCoupon(body.coupon, req.user);
  if (body.coupon && !coupon) return res.status(400).json({ error: 'Geçersiz kupon kodu' });

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const discount = coupon ? (subtotal * coupon.discount_pct) / 100 : 0;
  const total = Math.round((subtotal - discount) * 100) / 100;

  const user = getUserById(req.user.id);
  if (total > user.credit) {
    return res.status(402).json({ error: 'Yetersiz bakiye', required: total, credit: user.credit, hint: 'Hesabım sayfasından hediye çeki tanımlayabilirsiniz.' });
  }

  db.prepare('UPDATE users SET credit = credit - ? WHERE id = ?').run(total, user.id);
  const result = insert('orders', {
    user_id: user.id,
    total,
    status: 'hazirlaniyor',
    address,
    gift_message: body.gift_message ? String(body.gift_message).slice(0, 500) : null,
    delivery_note: body.delivery_note ? String(body.delivery_note).slice(0, 300) : null,
    coupon_code: coupon ? coupon.code : null,
  });
  const orderId = Number(result.lastInsertRowid);

  for (const l of lines) {
    insert('order_items', {
      order_id: orderId,
      product_id: l.product.id,
      name: l.product.name,
      price: l.price,
      qty: l.qty,
      license_key: l.product.is_digital ? l.product.license_key || randomCode('PSL', 12) : null,
    });
    if (!l.product.is_digital) db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(l.qty, l.product.id);
  }

  writeInvoice(orderId);
  addNotification(user.id, 'order', 'Siparişiniz alındı', `INV-${orderId} numaralı siparişiniz (${formatTRY(total)}) hazırlanıyor.`);
  res.status(201).json({ order_id: orderId, total, credit: getUserById(user.id).credit });
});

// Hediye ceki bakiyesi odeme saglayicisinin cuzdan servisine kaydedilir
async function recordWalletTransaction(userId, amount, reference) {
  await sleep(250 + Math.floor(Math.random() * 150));
  return { ok: true, reference: `WLT-${reference}-${userId}` };
}

router.post('/gift-cards/redeem', requireAuth, async (req, res, next) => {
  try {
    const code = String((req.body || {}).code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Hediye çeki kodu gerekli' });

    const card = db.prepare('SELECT * FROM gift_cards WHERE code = ?').get(code);
    if (!card) return res.status(404).json({ error: 'Geçersiz hediye çeki kodu' });
    if (card.redeemed_at) return res.status(409).json({ error: 'Bu hediye çeki daha önce kullanılmış' });
    if (card.issued_to && card.issued_to !== req.user.id) return res.status(403).json({ error: 'Bu hediye çeki başka bir hesaba tanımlı' });

    await recordWalletTransaction(req.user.id, card.amount, card.id);

    db.prepare('UPDATE users SET credit = credit + ? WHERE id = ?').run(card.amount, req.user.id);
    db.prepare("UPDATE gift_cards SET redeemed_by = ?, redeemed_at = datetime('now') WHERE id = ?").run(req.user.id, card.id);

    const user = publicUser(getUserById(req.user.id));
    res.json({ ok: true, amount: card.amount, credit: user.credit, tier: user.tier });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
