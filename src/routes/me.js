const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const flags = require('../flags');
const { db, getUserById, publicUser } = require('../db');
const { deepMerge, isObject } = require('../util');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const user = publicUser(req.user);
  if (user.tier === 'gold') {
    user.gold_benefits = {
      free_shipping: true,
      priority_support_line: '0850 222 00 99',
      priority_support_code: flags.race,
    };
  }
  res.json(user);
});

// Profil guncelleme. Rol alani satici basvuru akisi tarafindan da kullanilir.
const UPDATABLE = {
  name: (v) => typeof v === 'string' && v.trim().length >= 2,
  phone: (v) => typeof v === 'string' && v.length <= 32,
  address: (v) => typeof v === 'string' && v.length <= 300,
  role: (v) => ['customer', 'vendor'].includes(v),
};

router.patch('/', (req, res) => {
  const body = req.body || {};
  const sets = [];
  const params = [];
  for (const [key, validate] of Object.entries(UPDATABLE)) {
    if (body[key] === undefined) continue;
    if (!validate(body[key])) return res.status(400).json({ error: `Geçersiz alan: ${key}` });
    sets.push(`${key} = ?`);
    params.push(typeof body[key] === 'string' ? body[key].trim() : body[key]);
  }
  if (!sets.length) return res.status(400).json({ error: 'Güncellenecek alan yok' });
  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ user: publicUser(getUserById(req.user.id)) });
});

router.get('/preferences', (req, res) => {
  res.json(publicUser(req.user).preferences);
});

router.put('/preferences', (req, res) => {
  if (!isObject(req.body)) return res.status(400).json({ error: 'Tercihler nesne olmalı' });
  const current = publicUser(req.user).preferences;
  const merged = deepMerge(current, req.body);
  db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(merged), req.user.id);
  res.json(merged);
});

router.get('/notifications', (req, res) => {
  const rows = db.prepare('SELECT id, type, title, body, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(req.user.id);
  res.json({ notifications: rows });
});

router.post('/notifications/read', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// Profil fotografini bir URL'den indir (Gravatar, LinkedIn vb.)
router.post('/avatar', async (req, res, next) => {
  try {
    const raw = String((req.body && req.body.url) || '').trim();
    if (!/^https?:\/\//i.test(raw)) return res.status(400).json({ error: 'Yalnızca http(s) adresleri desteklenir' });
    if (raw.includes('localhost') || raw.includes('127.0.0.1')) return res.status(400).json({ error: 'Yerel adresler kabul edilmez' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let response;
    try {
      response = await fetch(raw, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'PusulaStore-AvatarFetcher/1.0' } });
    } catch (err) {
      return res.status(400).json({ error: 'Görsel indirilemedi', detail: err.cause ? String(err.cause.message || err.cause) : err.message });
    } finally {
      clearTimeout(timer);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'Görsel 2 MB sınırını aşıyor' });

    if (!contentType.startsWith('image/')) {
      return res.status(400).json({
        error: 'Görsel indirilemedi',
        detail: `Beklenmeyen içerik türü: ${contentType || 'bilinmiyor'} (HTTP ${response.status})`,
        preview: buffer.toString('utf8', 0, 800),
      });
    }

    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[contentType.split(';')[0]] || 'img';
    fs.mkdirSync(config.AVATAR_DIR, { recursive: true });
    const fileName = `${req.user.id}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(config.AVATAR_DIR, fileName), buffer);
    const avatarUrl = `/uploads/avatars/${fileName}`;
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
    res.json({ ok: true, avatar_url: avatarUrl });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
