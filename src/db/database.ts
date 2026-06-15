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
      stock_updated INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- 'operational' | 'inventory'
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      linked_product_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      user_id TEXT,
      FOREIGN KEY (linked_product_id) REFERENCES products(id)
    );
  `);

  // Migration: add min_stock_alert to products if it doesn't exist
  const tableInfo = db.getAllSync("PRAGMA table_info(products)") as any[];
  const hasMinStockAlert = tableInfo.some(col => col.name === 'min_stock_alert');
  if (!hasMinStockAlert) {
    db.execSync('ALTER TABLE products ADD COLUMN min_stock_alert INTEGER DEFAULT 0');
  }

  // Migration: add stock_updated to sales if it doesn't exist
  const salesTableInfo = db.getAllSync("PRAGMA table_info(sales)") as any[];
  const hasStockUpdated = salesTableInfo.some(col => col.name === 'stock_updated');
  if (!hasStockUpdated) {
    db.execSync('ALTER TABLE sales ADD COLUMN stock_updated INTEGER DEFAULT 0');
  }
}

// Товары
export function addProduct(name: string, buyPrice: number, sellPrice: number, stock: number, minStockAlert: number = 0) {
  try {
    const result = db.runSync(
      'INSERT INTO products (name, buy_price, sell_price, stock, min_stock_alert) VALUES (?, ?, ?, ?, ?)',
      [name, buyPrice, sellPrice, stock, minStockAlert]
    );
    if (stock <= minStockAlert && minStockAlert > 0) {
      notifyLowStock(name, stock);
    }
    return result;
  } catch (error) {
    console.error('Error adding product:', error);
    throw error;
  }
}

export function updateProduct(id: number, name: string, buyPrice: number, sellPrice: number, stock: number, minStockAlert: number) {
  try {
    const result = db.runSync(
      'UPDATE products SET name = ?, buy_price = ?, sell_price = ?, stock = ?, min_stock_alert = ? WHERE id = ?',
      [name, buyPrice, sellPrice, stock, minStockAlert, id]
    );
    if (stock <= minStockAlert && minStockAlert > 0) {
      notifyLowStock(name, stock);
    }
    return result;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
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
  const stockUpdated = productId ? 1 : 0;
  try {
    db.runSync(
      'INSERT INTO sales (product_id, product_name, quantity, sell_price, buy_price, profit, note, stock_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [productId, productName, quantity, sellPrice, buyPrice, profit, note, stockUpdated]
    );
    if (productId) updateStock(productId, quantity);
    return profit;
  } catch (error) {
    console.error('Error adding sale:', error);
    throw error;
  }
}

export function getSalesToday() {
  return db.getAllSync(
    `SELECT * FROM sales WHERE date(created_at) = date('now') ORDER BY created_at DESC`
  );
}

export function getSalesByPeriod(days: number) {
  return db.getAllSync(
    "SELECT * FROM sales WHERE created_at >= datetime('now', '-' || ? || ' days') ORDER BY created_at DESC",
    [days]
  );
}

export function deleteSale(saleId: number) {
  try {
    const sale = db.getFirstSync('SELECT * FROM sales WHERE id = ?', [saleId]) as any;
    if (sale && sale.product_id && sale.stock_updated === 1) {
      db.runSync('UPDATE products SET stock = stock + ? WHERE id = ?', [sale.quantity, sale.product_id]);
    }
    return db.runSync('DELETE FROM sales WHERE id = ?', [saleId]);
  } catch (error) {
    console.error('Error deleting sale:', error);
    throw error;
  }
}

// Статистика
export function getStats(days: number = 1) {
  const result = db.getFirstSync(`
    SELECT 
      COALESCE(SUM(sell_price * quantity), 0) as revenue,
      COALESCE(SUM(profit), 0) as profit,
      COALESCE(COUNT(*), 0) as count
    FROM sales 
    WHERE created_at >= datetime('now', '-' || ? || ' days')
  `, [days]) as any;
  return result;
}

// Расходы
export function addExpense(
  type: string,
  category: string,
  amount: number,
  description: string,
  userId: string,
  linkedProductId: number | null = null
) {
  try {
    return db.runSync(
      'INSERT INTO expenses (type, category, amount, description, user_id, linked_product_id) VALUES (?, ?, ?, ?, ?, ?)',
      [type, category, amount, description, userId, linkedProductId]
    );
  } catch (error) {
    console.error('Error adding expense:', error);
    throw error;
  }
}

export function getExpenses(days: number = 1) {
  return db.getAllSync(
    "SELECT * FROM expenses WHERE created_at >= datetime('now', '-' || ? || ' days') ORDER BY created_at DESC",
    [days]
  );
}

export function deleteExpense(id: number) {
  return db.runSync('DELETE FROM expenses WHERE id = ?', [id]);
}

export function getExpenseStats(days: number = 1) {
  const result = db.getFirstSync(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'operational' THEN amount ELSE 0 END), 0) as operational,
      COALESCE(SUM(CASE WHEN type = 'inventory' THEN amount ELSE 0 END), 0) as inventory,
      COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE created_at >= datetime('now', '-' || ? || ' days')
  `, [days]) as any;
  return result;
}

export function getAnnualStats() {
  // Monthly breakdown for the current year
  const year = new Date().getFullYear();
  const months = [];

  for (let m = 1; m <= 12; m++) {
    const monthStr = String(m).padStart(2, '0');
    const from = `${year}-${monthStr}-01`;
    // Last day of month
    const lastDay = new Date(year, m, 0).getDate();
    const to = `${year}-${monthStr}-${lastDay}`;

    const sales = db.getFirstSync(`
      SELECT
        COALESCE(SUM(sell_price * quantity), 0) as revenue,
        COALESCE(SUM(profit), 0) as profit,
        COALESCE(COUNT(*), 0) as salesCount
      FROM sales
      WHERE date(created_at) >= ? AND date(created_at) <= ?
    `, [from, to]) as any;

    const expenses = db.getFirstSync(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE date(created_at) >= ? AND date(created_at) <= ?
    `, [from, to]) as any;

    months.push({
      month: m,
      revenue: sales?.revenue || 0,
      profit: sales?.profit || 0,
      salesCount: sales?.salesCount || 0,
      expenses: expenses?.total || 0,
      netProfit: (sales?.profit || 0) - (expenses?.total || 0),
    });
  }

  // Top products for the year
  const topProducts = db.getAllSync(`
    SELECT
      product_name,
      SUM(profit) as totalProfit,
      SUM(quantity) as totalQty,
      COUNT(*) as salesCount
    FROM sales
    WHERE created_at >= date('${year}-01-01')
    GROUP BY product_name
    ORDER BY totalProfit DESC
    LIMIT 10
  `) as any[];

  // Year totals
  const totals = db.getFirstSync(`
    SELECT
      COALESCE(SUM(sell_price * quantity), 0) as revenue,
      COALESCE(SUM(profit), 0) as profit,
      COALESCE(COUNT(*), 0) as salesCount
    FROM sales
    WHERE strftime('%Y', created_at) = '${year}'
  `) as any;

  const totalExpenses = db.getFirstSync(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE strftime('%Y', created_at) = '${year}'
  `) as any;

  return {
    year,
    months,
    topProducts,
    totals: {
      revenue: totals?.revenue || 0,
      profit: totals?.profit || 0,
      salesCount: totals?.salesCount || 0,
      expenses: totalExpenses?.total || 0,
      netProfit: (totals?.profit || 0) - (totalExpenses?.total || 0),
    }
  };
}

export function searchProductsForAutocomplete(query: string) {
  if (!query.trim()) {
    // Top 5 most frequent items
    return db.getAllSync(`
      WITH AllItems AS (
        SELECT
          CAST(p.id AS TEXT) as id,
          p.name,
          'catalog' as source,
          p.buy_price as purchasePrice,
          (SELECT s.sell_price FROM sales s WHERE s.product_id = p.id ORDER BY s.created_at DESC LIMIT 1) as lastSalePrice,
          (SELECT COUNT(*) FROM sales s WHERE s.product_id = p.id) as salesCount,
          (SELECT MAX(s.created_at) FROM sales s WHERE s.product_id = p.id) as lastSoldAt
        FROM products p
        UNION ALL
        SELECT
          NULL as id,
          s.product_name as name,
          'history' as source,
          (SELECT s2.buy_price FROM sales s2 WHERE s2.product_name = s.product_name AND s2.product_id IS NULL ORDER BY s2.created_at DESC LIMIT 1) as purchasePrice,
          (SELECT s2.sell_price FROM sales s2 WHERE s2.product_name = s.product_name AND s2.product_id IS NULL ORDER BY s2.created_at DESC LIMIT 1) as lastSalePrice,
          COUNT(*) as salesCount,
          MAX(s.created_at) as lastSoldAt
        FROM sales s
        WHERE s.product_id IS NULL
          AND s.product_name NOT IN (SELECT name FROM products)
        GROUP BY s.product_name
      )
      SELECT * FROM AllItems
      ORDER BY salesCount DESC, lastSoldAt DESC
      LIMIT 5
    `);
  }

  // Search by query
  return db.getAllSync(`
    WITH CatalogMatches AS (
      SELECT
        CAST(p.id AS TEXT) as id,
        p.name,
        'catalog' as source,
        p.buy_price as purchasePrice,
        (SELECT s.sell_price FROM sales s WHERE s.product_id = p.id ORDER BY s.created_at DESC LIMIT 1) as lastSalePrice,
        (SELECT COUNT(*) FROM sales s WHERE s.product_id = p.id) as salesCount,
        (SELECT MAX(s.created_at) FROM sales s WHERE s.product_id = p.id) as lastSoldAt
      FROM products p
      WHERE p.name LIKE ? || '%'
    ),
    HistoryMatches AS (
      SELECT
        NULL as id,
        s.product_name as name,
        'history' as source,
        (SELECT s2.buy_price FROM sales s2 WHERE s2.product_name = s.product_name AND s2.product_id IS NULL ORDER BY s2.created_at DESC LIMIT 1) as purchasePrice,
        (SELECT s2.sell_price FROM sales s2 WHERE s2.product_name = s.product_name AND s2.product_id IS NULL ORDER BY s2.created_at DESC LIMIT 1) as lastSalePrice,
        COUNT(*) as salesCount,
        MAX(s.created_at) as lastSoldAt
      FROM sales s
      WHERE s.product_id IS NULL
        AND s.product_name LIKE ? || '%'
        AND s.product_name NOT IN (SELECT name FROM products)
      GROUP BY s.product_name
    )
    SELECT * FROM CatalogMatches
    UNION ALL
    SELECT * FROM HistoryMatches
    ORDER BY
      CASE WHEN source = 'catalog' THEN 0 ELSE 1 END,
      salesCount DESC,
      lastSoldAt DESC
    LIMIT 8
  `, [query, query]);
}

export default db;