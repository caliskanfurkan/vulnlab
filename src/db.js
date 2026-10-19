const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const flags = require('./flags');
const { md5, hashPassword, randomCode, invoicePdf } = require('./util');

const db = new DatabaseSync(':memory:');

// Calisma zamani ayarlari: settings tablosundan yuklenir
const settings = {};

function exec(sql) {
  db.exec(sql);
}

function createSchema() {
  exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT,
      legacy_md5 TEXT,
      role TEXT NOT NULL DEFAULT 'customer',
      credit REAL NOT NULL DEFAULT 0,
      phone TEXT,
      address TEXT,
      avatar_url TEXT,
      preferences TEXT NOT NULL DEFAULT '{}',
      otp_enabled INTEGER NOT NULL DEFAULT 0,
      api_token TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      image TEXT,
      stock INTEGER NOT NULL DEFAULT 0,
      vendor_id INTEGER,
      published INTEGER NOT NULL DEFAULT 1,
      is_digital INTEGER NOT NULL DEFAULT 0,
      license_key TEXT,
      featured INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved',
      moderation_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'hazirlaniyor',
      address TEXT,
      gift_message TEXT,
      delivery_note TEXT,
      coupon_code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      qty INTEGER NOT NULL,
      license_key TEXT
    );
    CREATE TABLE gift_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      issued_to INTEGER,
      redeemed_by INTEGER,
      redeemed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      discount_pct INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      audience TEXT NOT NULL DEFAULT 'public',
      internal_note TEXT
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'system',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE otp_challenges (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE api_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      environment TEXT NOT NULL,
      key_id TEXT NOT NULL,
      secret TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'public',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function insert(table, row) {
  const keys = Object.keys(row);
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  return db.prepare(sql).run(...keys.map((k) => row[k]));
}

function seed() {
  const users = [
    { id: 1, email: 'admin@pusula.local', name: 'Sistem Yöneticisi', password: 'Adm1n-Pusula-2026!', role: 'admin', credit: 0, phone: '+90 212 000 00 01', address: 'Maslak Mah. Büyükdere Cad. No:255 Sarıyer / İstanbul' },
    { id: 2, email: 'muhasebe@pusula.local', name: 'Elif Kaya', password: 'qwerty123', legacy: true, role: 'staff', credit: 0, otp: 1, phone: '+90 212 000 00 14', address: 'Maslak Mah. Büyükdere Cad. No:255 Sarıyer / İstanbul' },
    { id: 3, email: 'destek@pusula.local', name: 'Can Demir', password: randomCode('', 16), role: 'staff', credit: 0 },
    { id: 4, email: 'ayse.yilmaz@example.com', name: 'Ayşe Yılmaz', password: 'Ayse.2024!', role: 'customer', credit: 120, phone: '+90 532 111 22 33', address: 'Bağdat Cad. No:112 D:4 Kadıköy / İstanbul' },
    { id: 5, email: 'mehmet.ozturk@example.com', name: 'Mehmet Öztürk', password: 'mehmet1985', legacy: true, role: 'customer', credit: 45.5, phone: '+90 505 444 55 66', address: 'Kızılay Mah. Atatürk Blv. No:48 Çankaya / Ankara' },
    { id: 6, email: 'svc-backup@pusula.local', name: 'Yedekleme Servisi', password: randomCode('', 24), role: 'service', credit: 0, api_token: flags.v1 },
    { id: 7, email: 'satis@teknosat.example', name: 'TeknoSat Elektronik', password: randomCode('', 16), role: 'vendor', credit: 0, phone: '+90 216 777 88 99', address: 'İMES Sanayi Sitesi B Blok No:21 Ümraniye / İstanbul' },
  ];
  for (const u of users) {
    insert('users', {
      id: u.id,
      email: u.email,
      name: u.name,
      password_hash: hashPassword(u.password),
      legacy_md5: u.legacy ? md5(u.password) : null,
      role: u.role,
      credit: u.credit,
      phone: u.phone || null,
      address: u.address || null,
      preferences: JSON.stringify({ theme: 'light', language: 'tr', notifications: { email: true, sms: false } }),
      otp_enabled: u.otp || 0,
      api_token: u.api_token || null,
      created_at: '2024-03-1' + u.id + ' 09:1' + u.id + ':00',
    });
  }

  const products = [
    { id: 1, name: 'Pusula Book 14', category: 'Bilgisayar', price: 34999, stock: 12, image: 'laptop.svg', featured: 1, description: '14" 2.8K OLED ekran, 32 GB RAM, 1 TB SSD. Hafif alüminyum gövde ve 18 saate kadar pil ömrü ile taşınabilir güç.' },
    { id: 2, name: 'Pusula Phone X2', category: 'Telefon', price: 24499, stock: 40, image: 'phone.svg', featured: 1, description: '6.7" 120 Hz AMOLED ekran, 200 MP ana kamera, 5000 mAh pil ve 5 yıl güvenlik güncellemesi garantisi.' },
    { id: 3, name: 'Kablosuz Kulaklık Pro', category: 'Aksesuar', price: 2999, stock: 150, image: 'headphones.svg', featured: 1, vendor_id: 7, description: 'Aktif gürültü engelleme, 40 saat pil, çoklu cihaz bağlantısı. Kulak içi algılama ile otomatik duraklatma.' },
    { id: 4, name: '27" 4K Monitör', category: 'Monitör', price: 8750, stock: 25, image: 'monitor.svg', featured: 1, description: 'IPS panel, 144 Hz, HDR600, USB-C 90W güç beslemesi. Ergonomik ayarlanabilir stand.' },
    { id: 5, name: 'Mekanik Klavye TKL', category: 'Aksesuar', price: 1850, stock: 80, image: 'keyboard.svg', vendor_id: 7, description: 'Hot-swap anahtarlar, PBT tuş takımı, Türkçe Q dizilim. Kablolu ve Bluetooth bağlantı.' },
    { id: 6, name: 'USB-C Hub 7\'si 1 Arada', category: 'Aksesuar', price: 649, stock: 300, image: 'hub.svg', vendor_id: 7, description: 'HDMI 4K60, 2x USB-A 3.2, SD/microSD, 100W PD geçişi, Gigabit Ethernet.' },
    { id: 7, name: 'Akıllı Saat S3', category: 'Giyilebilir', price: 5499, stock: 60, image: 'watch.svg', featured: 1, description: 'EKG, SpO2 ve uyku takibi. 7 gün pil ömrü, 5 ATM su dayanımı, her zaman açık ekran.' },
    { id: 8, name: 'Taşınabilir SSD 1 TB', category: 'Depolama', price: 2250, stock: 120, image: 'ssd.svg', vendor_id: 7, description: 'USB 3.2 Gen2, 1050 MB/s okuma. Donanımsal şifreleme ve 2 metre düşme dayanımı.' },
    { id: 9, name: 'Pusula Cloud Yedekleme — Bireysel (Yıllık)', category: 'Yazılım', price: 499, stock: 9999, image: 'cloud.svg', is_digital: 1, featured: 1, description: '2 TB uçtan uca şifreli bulut yedekleme. 3 cihaza kadar. Lisans anahtarı sipariş sonrası anında teslim edilir.' },
    { id: 10, name: 'Pusula Cloud Yedekleme — Kurumsal (Yıllık)', category: 'Yazılım', price: 249000, stock: 9999, image: 'cloud.svg', is_digital: 1, license_key: flags.price, description: 'Sınırsız kullanıcı, 100 TB havuz, SSO/SCIM entegrasyonu, 7/24 öncelikli destek ve özel hesap yöneticisi. Lisans anahtarı sipariş sonrası anında teslim edilir.' },
  ];
  for (const p of products) {
    insert('products', { id: p.id, name: p.name, description: p.description, price: p.price, category: p.category, image: p.image, stock: p.stock, vendor_id: p.vendor_id || null, published: 1, is_digital: p.is_digital || 0, license_key: p.license_key || null, featured: p.featured || 0 });
  }

  const reviews = [
    { product_id: 1, user_id: 4, rating: 5, body: 'Ekran kalitesi inanılmaz, pil gerçekten iki iş günü gidiyor. Klavye tecrübesi de çok iyi.' },
    { product_id: 1, user_id: 5, rating: 4, body: 'Fiyatı yüksek ama performansı karşılığını veriyor. Kutudan şarj adaptörü çıkmaması eksi.' },
    { product_id: 2, user_id: 5, rating: 2, body: 'Kamera iddia edildiği gibi değil, gece çekimleri bulanık. İade sürecinde satıcı yardımcı olmadı.', moderation_note: `Satıcı itirazı incelendi, yorum yayında kalıyor. Eskalasyon referansı: ${flags.exposure}` },
    { product_id: 2, user_id: 4, rating: 5, body: 'İki haftadır kullanıyorum, ısınma yok, ekran parlaklığı güneşte bile yeterli.' },
    { product_id: 3, user_id: 4, rating: 4, body: 'Gürültü engelleme metroda bile çalışıyor. Kulak yastıkları biraz sert.' },
    { product_id: 7, user_id: 5, rating: 5, body: 'Uyku takibi ve EKG özellikleri için aldım, doktorum da verileri faydalı buldu.' },
    { product_id: 9, user_id: 4, rating: 5, body: 'Kurulumu 5 dakika sürdü, arka planda sessizce çalışıyor. Lisans anında geldi.' },
  ];
  for (const r of reviews) insert('reviews', { ...r, status: 'approved', moderation_note: r.moderation_note || null });

  const orders = [
    { id: 1001, user_id: 4, items: [[3, 1], [6, 2]], address: 'Bağdat Cad. No:112 D:4 Kadıköy / İstanbul', delivery_note: 'Kapıcıya bırakabilirsiniz.', status: 'teslim_edildi', created_at: '2026-09-02 14:21:00' },
    { id: 1002, user_id: 1, items: [[1, 2], [4, 2]], address: 'Maslak Mah. Büyükdere Cad. No:255 Sarıyer / İstanbul', delivery_note: `Ofis resepsiyonuna teslim edilecek. Teslimat teyit kodu: ${flags.idor}`, status: 'kargoda', created_at: '2026-09-15 10:05:00' },
    { id: 1003, user_id: 5, items: [[7, 1]], address: 'Kızılay Mah. Atatürk Blv. No:48 Çankaya / Ankara', delivery_note: null, status: 'teslim_edildi', created_at: '2026-09-20 18:40:00' },
    { id: 1004, user_id: 2, items: [[5, 4], [8, 4]], address: 'Maslak Mah. Büyükdere Cad. No:255 Sarıyer / İstanbul', delivery_note: 'Muhasebe departmanı, 3. kat.', status: 'teslim_edildi', created_at: '2026-10-01 09:12:00' },
    { id: 1005, user_id: 4, items: [[9, 1]], address: 'Bağdat Cad. No:112 D:4 Kadıköy / İstanbul', delivery_note: null, status: 'tamamlandi', created_at: '2026-10-11 21:33:00' },
  ];
  for (const o of orders) {
    let total = 0;
    const rows = [];
    for (const [pid, qty] of o.items) {
      const p = products.find((x) => x.id === pid);
      total += p.price * qty;
      rows.push({ order_id: o.id, product_id: pid, name: p.name, price: p.price, qty, license_key: p.is_digital ? randomCode('PSL', 12) : null });
    }
    insert('orders', { id: o.id, user_id: o.user_id, total, status: o.status, address: o.address, gift_message: null, delivery_note: o.delivery_note, coupon_code: null, created_at: o.created_at });
    for (const r of rows) insert('order_items', r);
  }

  // Eski kampanya hediye cekleri (kullanilmis)
  insert('gift_cards', { code: 'WELCOME-7HQ2ZK', amount: 250, issued_to: 4, redeemed_by: 4, redeemed_at: '2026-08-30 12:00:00' });
  insert('gift_cards', { code: 'WELCOME-M3XP8A', amount: 250, issued_to: 5, redeemed_by: 5, redeemed_at: '2026-09-18 16:45:00' });

  insert('coupons', { code: 'YAZ2026', discount_pct: 10, active: 1, audience: 'public', internal_note: 'Yaz kampanyası, 31 Ağustos sonrası pasife alınacak.' });
  insert('coupons', { code: 'HOSGELDIN5', discount_pct: 5, active: 1, audience: 'public', internal_note: 'İlk sipariş kuponu.' });
  insert('coupons', { code: 'PERSONEL50', discount_pct: 50, active: 1, audience: 'staff', internal_note: `Yalnızca personel. İK onay kodu: ${flags.bfla}` });
  insert('coupons', { code: 'BLACKFRIDAY25', discount_pct: 25, active: 0, audience: 'public', internal_note: 'Kasım kampanyası, henüz aktif değil.' });

  insert('notifications', { user_id: 1, type: 'system', title: 'Ödeme altyapısı güncellendi', body: `iyzico canlı ortam geçişi tamamlandı. Yönetici paneli doğrulama kodu: ${flags.reset}`, created_at: '2026-10-10 08:30:00' });
  insert('notifications', { user_id: 1, type: 'system', title: 'Haftalık özet', body: 'Geçen hafta 184 sipariş, %3.1 iade oranı.', created_at: '2026-10-13 07:00:00' });
  insert('notifications', { user_id: 2, type: 'system', title: 'Finans sistemi erişimi', body: `Yeni muhasebe entegrasyonu (Logo) için API erişim kodunuz: ${flags.otp}. Lütfen kimseyle paylaşmayın.`, created_at: '2026-10-05 11:20:00' });
  insert('notifications', { user_id: 2, type: 'order', title: 'Siparişiniz teslim edildi', body: 'INV-1004 numaralı siparişiniz teslim edildi.', created_at: '2026-10-03 15:10:00' });
  insert('notifications', { user_id: 4, type: 'order', title: 'Siparişiniz teslim edildi', body: 'INV-1001 numaralı siparişiniz teslim edildi.', created_at: '2026-09-04 13:00:00' });
  insert('notifications', { user_id: 5, type: 'order', title: 'Siparişiniz teslim edildi', body: 'INV-1003 numaralı siparişiniz teslim edildi.', created_at: '2026-09-22 12:00:00' });

  const settingRows = {
    store_name: 'Pusula Store',
    support_email: 'destek@pusula.local',
    currency: 'TRY',
    free_shipping_threshold: '500',
    maintenance_mode: '0',
    payment_provider: 'iyzico',
    payment_webhook_secret: flags.proto,
  };
  for (const [key, value] of Object.entries(settingRows)) insert('settings', { key, value });

  insert('api_credentials', { provider: 'iyzico', environment: 'live', key_id: 'PSL-3391-TR', secret: flags.sqli });
  insert('api_credentials', { provider: 'iyzico', environment: 'sandbox', key_id: 'sandbox-PSL-3391', secret: 'sandbox-4f2a9c1e7b' });
  insert('api_credentials', { provider: 'aras-kargo', environment: 'live', key_id: 'PUSULA-KARGO', secret: 'ak-8c1d2e3f4a5b' });

  insert('announcements', { title: 'Yaz kampanyası başladı', body: 'YAZ2026 kodu ile tüm aksesuarlarda %10 indirim.', audience: 'public', created_at: '2026-07-01 09:00:00' });
  insert('announcements', { title: '₺500 üzeri ücretsiz kargo', body: 'Tüm Türkiye\'ye 1-3 iş günü içinde teslimat.', audience: 'public', created_at: '2026-09-01 09:00:00' });
  insert('announcements', { title: 'VPN geçişi tamamlandı', body: `Yeni ofis VPN\'i (Pusula-Net) devrede. Geçiş erişim kodu: ${flags.gql}. Eski istemciyi kaldırmayı unutmayın.`, audience: 'staff', created_at: '2026-10-08 10:00:00' });
  insert('announcements', { title: 'Envanter sayımı', body: 'Cuma 17:00\'de depo sayımı yapılacak, lütfen sevkiyatları öğleden önce tamamlayın.', audience: 'staff', created_at: '2026-10-15 10:00:00' });
}

function loadSettings() {
  for (const row of db.prepare('SELECT key, value FROM settings').all()) settings[row.key] = row.value;
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email)) || null;
}

function publicUser(u) {
  if (!u) return null;
  let preferences = {};
  try { preferences = JSON.parse(u.preferences || '{}'); } catch { preferences = {}; }
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    credit: u.credit,
    tier: u.credit >= 1000 ? 'gold' : 'standard',
    phone: u.phone,
    address: u.address,
    avatar_url: u.avatar_url,
    preferences,
    otp_enabled: !!u.otp_enabled,
    created_at: u.created_at,
  };
}

function addNotification(userId, type, title, body) {
  insert('notifications', { user_id: userId, type, title, body });
}

function writeInvoice(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  const user = getUserById(order.user_id);
  fs.mkdirSync(config.INVOICE_DIR, { recursive: true });
  const file = path.join(config.INVOICE_DIR, `INV-${orderId}.pdf`);
  fs.writeFileSync(file, invoicePdf(order, items, user));
  return file;
}

function init() {
  createSchema();
  seed();
  loadSettings();
  for (const row of db.prepare('SELECT id FROM orders').all()) writeInvoice(row.id);
}

module.exports = { db, settings, init, insert, getUserById, getUserByEmail, publicUser, addNotification, writeInvoice };
