import * as SQLite from 'expo-sqlite';
import { notifyLowStock } from '../utils/notifications';

const db = SQLite.openDatabaseSync('savdo.db');

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      buy_price REAL NOT NULL,
      sell_price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      min_stock_alert INTEGER DEFAULT 0,
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

  // Migration: add min_stock_alert to products if it doesn't exist
  const tableInfo = db.getAllSync("PRAGMA table_info(products)") as any[];
  const hasMinStockAlert = tableInfo.some(col => col.name === 'min_stock_alert');
  if (!hasMinStockAlert) {
    db.execSync('ALTER TABLE products ADD COLUMN min_stock_alert INTEGER DEFAULT 0');
  }
}

// Товары
export function addProduct(name: string, buyPrice: number, sellPrice: number, stock: number, minStockAlert: number = 0) {
  const result = db.runSync(
    'INSERT INTO products (name, buy_price, sell_price, stock, min_stock_alert) VALUES (?, ?, ?, ?, ?)',
    [name, buyPrice, sellPrice, stock, minStockAlert]
  );
  if (stock <= minStockAlert && minStockAlert > 0) {
    notifyLowStock(name, stock);
  }
  return result;
}

export function updateProduct(id: number, name: string, buyPrice: number, sellPrice: number, stock: number, minStockAlert: number) {
  const result = db.runSync(
    'UPDATE products SET name = ?, buy_price = ?, sell_price = ?, stock = ?, min_stock_alert = ? WHERE id = ?',
    [name, buyPrice, sellPrice, stock, minStockAlert, id]
  );
  if (stock <= minStockAlert && minStockAlert > 0) {
    notifyLowStock(name, stock);
  }
  return result;
}

export function deleteProduct(id: number) {
  return db.runSync('DELETE FROM products WHERE id = ?', [id]);
}

export function getProducts() {
  return db.getAllSync('SELECT * FROM products ORDER BY name ASC');
}

export function updateStock(productId: number, quantity: number) {
  db.runSync('UPDATE products SET stock = stock - ? WHERE id = ?', [quantity, productId]);
  const p = db.getFirstSync('SELECT name, stock, min_stock_alert FROM products WHERE id = ?', [productId]) as any;
  if (p && p.stock <= p.min_stock_alert && p.min_stock_alert > 0) {
    notifyLowStock(p.name, p.stock);
  }
}

export function updateStockManual(productId: number, newStock: number) {
  db.runSync('UPDATE products SET stock = ? WHERE id = ?', [newStock, productId]);
  const p = db.getFirstSync('SELECT name, stock, min_stock_alert FROM products WHERE id = ?', [productId]) as any;
  if (p && p.stock <= p.min_stock_alert && p.min_stock_alert > 0) {
    notifyLowStock(p.name, p.stock);
  }
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

export function deleteSale(saleId: number) {
  const sale = db.getFirstSync('SELECT * FROM sales WHERE id = ?', [saleId]) as any;
  if (sale && sale.product_id) {
    db.runSync('UPDATE products SET stock = stock + ? WHERE id = ?', [sale.quantity, sale.product_id]);
  }
  return db.runSync('DELETE FROM sales WHERE id = ?', [saleId]);
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