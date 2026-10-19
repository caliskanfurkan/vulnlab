const express = require('express');
const crypto = require('crypto');
const { db, insert, getUserByEmail, getUserById, publicUser, addNotification } = require('../db');
const { hashPassword, verifyPassword, randomCode } = require('../util');
const { issueToken, setSession, clearSession } = require('../auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- OTP deneme sinirlayici (istemci basina 5 deneme / 10 dk) ---
const otpAttempts = new Map();

function clientKey(req) {
  // Yuk dengeleyici arkasinda gercek istemci adresi X-Forwarded-For ile gelir
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip;
}

function tooManyAttempts(key) {
  const now = Date.now();
  let entry = otpAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + 10 * 60 * 1000 };
    otpAttempts.set(key, entry);
  }
  entry.count += 1;
  return entry.count > 5;
}

router.post('/register', (req, res) => {
  const { email, name, password } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email))) return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin' });
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Ad soyad en az 2 karakter olmalı' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });
  if (getUserByEmail(email)) return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı' });

  const result = insert('users', {
    email: String(email).trim().toLowerCase(),
    name: String(name).trim(),
    password_hash: hashPassword(password),
    role: 'customer',
    credit: 0,
    preferences: JSON.stringify({ theme: 'light', language: 'tr', notifications: { email: true, sms: false } }),
  });
  const userId = Number(result.lastInsertRowid);

  // Hos geldin hediye ceki: tek kullanimlik, hesaba tanimli
  const code = randomCode('WELCOME', 6);
  insert('gift_cards', { code, amount: 250, issued_to: userId });
  addNotification(
    userId,
    'email',
    'Pusula Store\'a hoş geldiniz!',
    `Hesabınız oluşturuldu. ₺250 değerindeki hoş geldin hediye çekiniz: ${code}. Hesabım sayfasındaki "Hediye çeki kullan" alanından bakiyenize aktarabilirsiniz.`
  );

  const user = getUserById(userId);
  setSession(res, issueToken(user));
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'E-posta ve şifre gerekli' });

  const user = getUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'Bu e-posta ile kayıtlı bir hesap bulunamadı' });
  if (!verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Şifre hatalı' });

  if (user.otp_enabled) {
    const challengeId = crypto.randomUUID();
    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    insert('otp_challenges', { id: challengeId, user_id: user.id, code, expires_at: Date.now() + 30 * 60 * 1000 });
    return res.json({
      otp_required: true,
      challenge_id: challengeId,
      message: `Doğrulama kodu ${user.email.replace(/^(.{2}).+(@.+)$/, '$1***$2')} adresine gönderildi`,
    });
  }

  setSession(res, issueToken(user));
  res.json({ user: publicUser(user) });
});

router.post('/otp', (req, res) => {
  const { challenge_id, code } = req.body || {};
  if (!challenge_id || code === undefined) return res.status(400).json({ error: 'Doğrulama kodu gerekli' });

  if (tooManyAttempts(clientKey(req))) {
    res.set('Retry-After', '600');
    return res.status(429).json({ error: 'Çok fazla hatalı deneme. Lütfen 10 dakika sonra tekrar deneyin.' });
  }

  const challenge = db.prepare('SELECT * FROM otp_challenges WHERE id = ?').get(String(challenge_id));
  if (!challenge) return res.status(400).json({ error: 'Geçersiz doğrulama isteği' });
  if (challenge.expires_at < Date.now()) return res.status(400).json({ error: 'Doğrulama kodunun süresi doldu, lütfen tekrar giriş yapın' });
  if (String(code) !== challenge.code) return res.status(401).json({ error: 'Doğrulama kodu hatalı' });

  db.prepare('DELETE FROM otp_challenges WHERE id = ?').run(challenge.id);
  const user = getUserById(challenge.user_id);
  setSession(res, issueToken(user));
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// Sifre sifirlama: baglanti e-posta ile iletilir (uygulama ici bildirim kopyasi tutulur)
function buildResetToken(email, expiresAt) {
  return Buffer.from(`${email}:${expiresAt}`, 'utf8').toString('base64url');
}

function parseResetToken(token) {
  let decoded;
  try {
    decoded = Buffer.from(String(token), 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const idx = decoded.lastIndexOf(':');
  if (idx === -1) return null;
  const email = decoded.slice(0, idx);
  const expiresAt = Number(decoded.slice(idx + 1));
  if (!email || !Number.isFinite(expiresAt)) return null;
  return { email, expiresAt };
}

router.post('/forgot', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'E-posta adresi gerekli' });

  const user = getUserByEmail(email);
  if (user) {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const token = buildResetToken(user.email, expiresAt);
    const link = `${req.protocol}://${req.get('host')}/reset?token=${token}`;
    addNotification(user.id, 'email', 'Şifre sıfırlama talebi', `Şifrenizi sıfırlamak için bağlantıya tıklayın (1 saat geçerli): ${link}`);
  }

  res.json({ ok: true, message: 'Eğer bu e-posta adresi kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.' });
});

router.post('/reset', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token ve yeni şifre gerekli' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });

  const parsed = parseResetToken(token);
  if (!parsed) return res.status(400).json({ error: 'Geçersiz sıfırlama bağlantısı' });
  if (parsed.expiresAt < Date.now()) return res.status(400).json({ error: 'Sıfırlama bağlantısının süresi dolmuş' });

  const user = getUserByEmail(parsed.email);
  if (!user) return res.status(400).json({ error: 'Geçersiz sıfırlama bağlantısı' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  addNotification(user.id, 'system', 'Şifreniz değiştirildi', 'Hesap şifreniz başarıyla güncellendi. Bu işlemi siz yapmadıysanız destek ekibiyle iletişime geçin.');
  res.json({ ok: true, message: 'Şifreniz güncellendi. Şimdi giriş yapabilirsiniz.' });
});

module.exports = router;
