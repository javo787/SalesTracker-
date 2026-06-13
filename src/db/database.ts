import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('savdo.db');

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      buy_price REAL NOT NULL,
      sell_price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      product_name TEXT,
      quantity INTEGER DEFAULT 1,
      sell_price REAL NOT NULL,
      buy_price REAL NOT NULL,
      profit REAL NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);
}

// Товары
export function addProduct(name: string, buyPrice: number, sellPrice: number, stock: number) {
  return db.runSync(
    'INSERT INTO products (name, buy_price, sell_price, stock) VALUES (?, ?, ?, ?)',
    [name, buyPrice, sellPrice, stock]
  );
}

export function getProducts() {
  return db.getAllSync('SELECT * FROM products ORDER BY name ASC');
}

export function updateStock(productId: number, quantity: number) {
  db.runSync('UPDATE products SET stock = stock - ? WHERE id = ?', [quantity, productId]);
}

// Продажи
export function addSale(
  productId: number | null,
  productName: string,
  quantity: number,
  sellPrice: number,
  buyPrice: number,
  note: string = ''
) {
  const profit = (sellPrice - buyPrice) * quantity;
  db.runSync(
    'INSERT INTO sales (product_id, product_name, quantity, sell_price, buy_price, profit, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [productId, productName, quantity, sellPrice, buyPrice, profit, note]
  );
  if (productId) updateStock(productId, quantity);
  return profit;
}

export function getSalesToday() {
  return db.getAllSync(
    `SELECT * FROM sales WHERE date(created_at) = date('now') ORDER BY created_at DESC`
  );
}

export function getSalesByPeriod(days: number) {
  return db.getAllSync(
    `SELECT * FROM sales WHERE created_at >= datetime('now', '-${days} days') ORDER BY created_at DESC`
  );
}

// Статистика
export function getStats(days: number = 1) {
  const result = db.getFirstSync(`
    SELECT 
      COALESCE(SUM(sell_price * quantity), 0) as revenue,
      COALESCE(SUM(profit), 0) as profit,
      COALESCE(COUNT(*), 0) as count
    FROM sales 
    WHERE created_at >= datetime('now', '-${days} days')
  `) as any;
  return result;
}

export default db;