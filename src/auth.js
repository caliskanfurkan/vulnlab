const jwt = require('jsonwebtoken');
const config = require('./config');
const { getUserById } = require('./db');

const COOKIE_NAME = 'session';

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.JWT_SECRET, { expiresIn: '7d' });
}

function tokenFrom(req) {
  const header = req.get('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies ? req.cookies[COOKIE_NAME] : null;
}

// Her istekte oturumu cozer; gecersizse misafir olarak devam eder.
function authenticate(req, res, next) {
  req.user = null;
  const token = tokenFrom(req);
  if (token) {
    try {
      const payload = jwt.verify(token, config.JWT_SECRET);
      req.user = getUserById(payload.sub);
    } catch {
      req.user = null;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Oturum gerekli' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Oturum gerekli' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    next();
  };
}

function setSession(res, token) {
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000, path: '/' });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = { COOKIE_NAME, issueToken, tokenFrom, authenticate, requireAuth, requireRole, setSession, clearSession };
