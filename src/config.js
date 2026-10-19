const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

// Basit .env yukleyici (harici bagimlilik istemiyoruz)
function loadDotenv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotenv();

module.exports = {
  ROOT,
  PORT: parseInt(process.env.PORT || '3000', 10),
  STORE_NAME: process.env.STORE_NAME || 'Pusula Store',
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  STORAGE_DIR: path.join(ROOT, 'storage'),
  INVOICE_DIR: path.join(ROOT, 'storage', 'invoices'),
  AVATAR_DIR: path.join(ROOT, 'storage', 'uploads', 'avatars'),
  VIEWS_DIR: path.join(__dirname, 'views'),
  PUBLIC_DIR: path.join(__dirname, 'public'),
  VERSION: require('../package.json').version,
};
