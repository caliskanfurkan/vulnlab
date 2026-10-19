const express = require('express');
const { graphql, buildSchema } = require('graphql');
const { db, publicUser } = require('../db');

const router = express.Router();

const schema = buildSchema(`
  type Vendor {
    id: ID!
    name: String!
  }

  type Product {
    id: ID!
    name: String!
    description: String
    price: Float!
    category: String!
    image: String
    stock: Int!
    isDigital: Boolean!
    featured: Boolean!
    vendor: Vendor
  }

  type Announcement {
    id: ID!
    title: String!
    body: String!
    audience: String!
    createdAt: String!
  }

  type User {
    id: ID!
    email: String!
    name: String!
    role: String!
    credit: Float!
    tier: String!
  }

  type Query {
    products(search: String, category: String, featured: Boolean, limit: Int): [Product!]!
    product(id: ID!): Product
    categories: [String!]!
    announcements: [Announcement!]!
    staffAnnouncements: [Announcement!]!
    me: User
  }
`);

function mapProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    category: row.category,
    image: row.image,
    stock: row.stock,
    isDigital: !!row.is_digital,
    featured: !!row.featured,
    vendor: row.vendor_id ? (() => {
      const v = db.prepare('SELECT id, name FROM users WHERE id = ?').get(row.vendor_id);
      return v ? { id: v.id, name: v.name } : null;
    })() : null,
  };
}

function mapAnnouncement(row) {
  return { id: row.id, title: row.title, body: row.body, audience: row.audience, createdAt: row.created_at };
}

const root = {
  products({ search, category, featured, limit }) {
    let sql = 'SELECT * FROM products WHERE published = 1';
    const params = [];
    if (search) {
      sql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (featured) sql += ' AND featured = 1';
    sql += ' ORDER BY featured DESC, id ASC';
    const n = Math.min(Math.max(Number(limit) || 50, 1), 100);
    sql += ` LIMIT ${n}`;
    return db.prepare(sql).all(...params).map(mapProduct);
  },
  product({ id }) {
    return mapProduct(db.prepare('SELECT * FROM products WHERE id = ? AND published = 1').get(Number(id)));
  },
  categories() {
    return db.prepare('SELECT DISTINCT category FROM products WHERE published = 1 ORDER BY category').all().map((r) => r.category);
  },
  announcements() {
    return db.prepare("SELECT * FROM announcements WHERE audience = 'public' ORDER BY created_at DESC").all().map(mapAnnouncement);
  },
  staffAnnouncements() {
    return db.prepare("SELECT * FROM announcements WHERE audience = 'staff' ORDER BY created_at DESC").all().map(mapAnnouncement);
  },
  me(args, ctx) {
    return ctx.user ? publicUser(ctx.user) : null;
  },
};

async function handle(req, res, next) {
  try {
    const source = req.method === 'GET' ? req.query.query : (req.body || {}).query;
    if (!source || typeof source !== 'string') return res.status(400).json({ errors: [{ message: 'query alanı gerekli' }] });
    let variables = req.method === 'GET' ? req.query.variables : (req.body || {}).variables;
    if (typeof variables === 'string') {
      try { variables = JSON.parse(variables); } catch { variables = undefined; }
    }
    const result = await graphql({
      schema,
      source,
      rootValue: root,
      contextValue: { user: req.user },
      variableValues: variables,
      operationName: req.method === 'GET' ? req.query.operationName : (req.body || {}).operationName,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

router.get('/', handle);
router.post('/', handle);

module.exports = router;
