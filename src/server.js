const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const nunjucks = require('nunjucks');

const config = require('./config');
const dbModule = require('./db');
const { authenticate } = require('./auth');
const { formatTRY } = require('./util');

dbModule.init();
const { settings } = dbModule;

const app = express();
app.disable('x-powered-by');
app.set('view engine', 'njk');

const env = nunjucks.configure(config.VIEWS_DIR, { autoescape: true, express: app, noCache: process.env.NODE_ENV !== 'production' });
env.addFilter('try', formatTRY);
env.addFilter('date', (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : ''));

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(authenticate);

app.use('/static', express.static(config.PUBLIC_DIR, { maxAge: '1h' }));
app.use('/uploads/avatars', express.static(config.AVATAR_DIR));

app.get('/api/v2/health', (req, res) => {
  res.json({ status: 'ok', version: config.VERSION, debug: Boolean(settings.debug), maintenance: settings.maintenance_mode === '1' });
});

app.use('/api/v1', require('./routes/v1'));
app.use('/api/v2/auth', require('./routes/auth'));
app.use('/api/v2/me', require('./routes/me'));
app.use('/api/v2', require('./routes/catalog'));
app.use('/api/v2', require('./routes/orders'));
const adminRoutes = require('./routes/admin');
app.use('/api/v2', adminRoutes.router);
app.use('/internal', adminRoutes.internal);
app.use('/graphql', require('./routes/graphql'));
app.use('/', require('./routes/pages'));

app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/graphql')) return res.status(404).json({ error: 'Kaynak bulunamadı' });
  res.status(404).render('404.njk', { user: dbModule.publicUser(req.user), storeName: config.STORE_NAME });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const requestId = crypto.randomBytes(6).toString('hex');
  console.error(`[${requestId}]`, err);
  const body = { error: 'Sunucu hatası', request_id: requestId };
  if (settings.debug) {
    body.message = err.message;
    body.stack = err.stack;
    body.settings = settings;
  }
  if (req.accepts(['json', 'html']) === 'html' && !req.path.startsWith('/api/')) {
    return res.status(500).render('error.njk', { user: dbModule.publicUser(req.user), storeName: config.STORE_NAME, title: 'Bir şeyler ters gitti', message: `Hata kodu: ${requestId}`, debug: settings.debug ? body : null });
  }
  res.status(err.status || 500).json(body);
});

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`${config.STORE_NAME} v${config.VERSION} hazır: http://localhost:${config.PORT}`);
});
