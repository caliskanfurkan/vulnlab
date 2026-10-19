const crypto = require('crypto');

function md5(s) {
  return crypto.createHash('md5').update(String(s)).digest('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const candidate = crypto.scryptSync(String(password), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function randomCode(prefix, len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return prefix ? `${prefix}-${out}` : out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Kullanici tercihleri gibi ic ice ayar nesnelerini birlestirir.
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (isObject(value)) {
      if (!isObject(target[key])) target[key] = {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function formatTRY(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);
}

// Turkce karakterleri PDF icin ASCII'ye indirger (Helvetica/WinAnsi kisiti)
function ascii(s) {
  const map = { ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ü: 'u', Ü: 'U', ç: 'c', Ç: 'C', '₺': 'TL ' };
  return String(s).replace(/[şŞğĞıİöÖüÜçÇ₺]/g, (c) => map[c]).replace(/[()\\]/g, ' ');
}

// Harici kutuphane olmadan tek sayfalik basit bir PDF uretir.
function buildPdf(lines) {
  const content = ['BT', '/F1 11 Tf', '14 TL', '50 790 Td'];
  for (const line of lines) content.push(`(${ascii(line)}) Tj T*`);
  content.push('ET');
  const stream = content.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function invoicePdf(order, items, user) {
  const lines = [
    'PUSULA TEKNOLOJI A.S.',
    'Maslak Mah. Buyukdere Cad. No:255 Sariyer / Istanbul',
    'Vergi No: 7310458812  Mersis: 0731045881200017',
    '',
    `E-ARSIV FATURA  No: INV-${order.id}`,
    `Tarih: ${String(order.created_at).slice(0, 10)}`,
    '',
    `Musteri: ${user.name}`,
    `E-posta: ${user.email}`,
    `Teslimat adresi: ${order.address || '-'}`,
    '',
    'Urun                                   Adet      Birim        Toplam',
    '--------------------------------------------------------------------',
  ];
  for (const it of items) {
    const name = ascii(it.name).padEnd(38).slice(0, 38);
    lines.push(`${name} ${String(it.qty).padStart(4)}  ${formatTRY(it.price).padStart(12)} ${formatTRY(it.price * it.qty).padStart(13)}`);
  }
  lines.push('--------------------------------------------------------------------');
  lines.push(`Genel Toplam (KDV dahil): ${formatTRY(order.total)}`);
  lines.push('');
  lines.push('Bu belge elektronik ortamda olusturulmustur.');
  return buildPdf(lines);
}

module.exports = { md5, hashPassword, verifyPassword, randomCode, sleep, deepMerge, isObject, formatTRY, invoicePdf };
