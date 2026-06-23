import * as SQLite from 'expo-sqlite';
import { notifyLowStock } from '../utils/notifications';

const db = SQLite.openDatabaseSync('savdo.db');

function nowLocalISO(): string {
  // Возвращает локальное время устройства в формате 'YYYY-MM-DD HH:MM:SS'
  // БЕЗ конвертации в UTC (в отличие от toISOString())
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayLocalDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgoLocalISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      buy_price REAL NOT NULL,
      sell_price REAL NOT NULL,
      stock REAL DEFAULT 0,
      min_stock_alert REAL DEFAULT 0,
      base_unit TEXT DEFAULT 'шт',
      has_packages INTEGER DEFAULT 0,
      package_name TEXT,
      units_per_package REAL DEFAULT 1,
      category TEXT,
      updated_at TEXT,
      synced INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantity_change REAL NOT NULL,
      price_per_unit REAL,
      note TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id)
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
      created_at TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- 'operational' | 'inventory'
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      linked_product_id INTEGER,
      created_at TEXT,
      user_id TEXT,
      FOREIGN KEY (linked_product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      note TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      sale_id INTEGER,
      amount_total REAL NOT NULL,
      amount_paid REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      due_date TEXT,
      note TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      created_at TEXT,
      FOREIGN KEY (debt_id) REFERENCES debts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_debts_client_id ON debts(client_id);
    CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);

    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id);
    CREATE INDEX IF NOT EXISTS idx_sales_product_name ON sales(product_name);
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
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

  // Migration: add new warehouse columns to products
  const warehouseCols = [
    { name: 'base_unit', type: 'TEXT DEFAULT \'шт\'' },
    { name: 'has_packages', type: 'INTEGER DEFAULT 0' },
    { name: 'package_name', type: 'TEXT' },
    { name: 'units_per_package', type: 'REAL DEFAULT 1' },
    { name: 'updated_at', type: 'TEXT' },
    { name: 'synced', type: 'INTEGER DEFAULT 0' },
    { name: 'is_deleted', type: 'INTEGER DEFAULT 0' }
  ];

  warehouseCols.forEach(col => {
    if (!tableInfo.some(c => c.name === col.name)) {
      db.execSync(`ALTER TABLE products ADD COLUMN ${col.name} ${col.type}`);
    }
  });

  // Migration: add category to products
  if (!tableInfo.some(col => col.name === 'category')) {
    db.execSync('ALTER TABLE products ADD COLUMN category TEXT');
  }

  // Migration: timezone shift + one-time migration check
  db.execSync('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)');
  const migrationDone = db.getFirstSync("SELECT value FROM app_meta WHERE key = 'tz_migration_v1'") as { value: string } | null;

  if (!migrationDone) {
    db.withTransactionSync(() => {
      const tables = ['products', 'sales', 'expenses', 'stock_movements'];
      tables.forEach(table => {
        // Shift existing UTC timestamps by +5 hours.
        // We assume any record created WITHOUT a space in its string (e.g. '2023-01-01T12:00:00Z'
        // or just a date '2023-01-01' without HH:MM:SS) might be from the old system
        // that used datetime('now') which returns UTC 'YYYY-MM-DD HH:MM:SS'.
        // Actually, datetime('now') returns 'YYYY-MM-DD HH:MM:SS'.
        // To be safe, we only migrate records that were created BEFORE this migration script ran.
        // Since we marked the migration with 'tz_migration_v1', and this runs in initDatabase
        // before any new records can be inserted by the updated UI code,
        // we can safely update all existing records.
        db.execSync(`UPDATE ${table} SET created_at = datetime(created_at, '+5 hours') WHERE created_at IS NOT NULL`);
      });
      db.runSync("INSERT INTO app_meta (key, value) VALUES ('tz_migration_v1', 'done')");
    });
  }
}

// Товары
export function addProduct(
  name: string,
  buyPrice: number,
  sellPrice: number,
  stock: number,
  minStockAlert: number = 0,
  baseUnit: string = 'шт',
  hasPackages: number = 0,
  packageName: string | null = null,
  unitsPerPackage: number = 1,
  category: string | null = null
) {
  try {
    const now = nowLocalISO();
    const result = db.runSync(
      `INSERT INTO products (
        name, buy_price, sell_price, stock, min_stock_alert,
        base_unit, has_packages, package_name, units_per_package,
        category, updated_at, synced, is_deleted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [name, buyPrice, sellPrice, stock, minStockAlert, baseUnit, hasPackages, packageName, unitsPerPackage, category, now, now]
    );
    if (stock <= minStockAlert && minStockAlert > 0) {
      notifyLowStock(name, stock);
    }
    return result as { lastInsertRowId: number; changes: number };
  } catch (error) {
    console.error('Error adding product:', error);
    throw error;
  }
}

export function updateProduct(
  id: number,
  name: string,
  buyPrice: number,
  sellPrice: number,
  stock: number,
  minStockAlert: number,
  baseUnit: string = 'шт',
  hasPackages: number = 0,
  packageName: string | null = null,
  unitsPerPackage: number = 1,
  category: string | null = null
) {
  try {
    const result = db.runSync(
      `UPDATE products SET
        name = ?, buy_price = ?, sell_price = ?, stock = ?, min_stock_alert = ?,
        base_unit = ?, has_packages = ?, package_name = ?, units_per_package = ?,
        category = ?, updated_at = ?, synced = 0
      WHERE id = ?`,
      [name, buyPrice, sellPrice, stock, minStockAlert, baseUnit, hasPackages, packageName, unitsPerPackage, category, nowLocalISO(), id]
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
  // Soft delete for sync compatibility
  return db.runSync('UPDATE products SET is_deleted = 1, synced = 0, updated_at = ? WHERE id = ?', [nowLocalISO(), id]);
}

export function convertAllAmounts(rate: number) {
  db.withTransactionSync(() => {
    db.runSync('UPDATE products SET buy_price = ROUND(buy_price * ?, 2), sell_price = ROUND(sell_price * ?, 2)', [rate, rate]);
    db.runSync('UPDATE sales SET sell_price = ROUND(sell_price * ?, 2), buy_price = ROUND(buy_price * ?, 2), profit = ROUND(profit * ?, 2)', [rate, rate, rate]);
    db.runSync('UPDATE expenses SET amount = ROUND(amount * ?, 2)', [rate]);
  });
}

export function clearAllData() {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM debt_payments');
    db.runSync('DELETE FROM debts');
    db.runSync('DELETE FROM clients');
    db.runSync('DELETE FROM stock_movements');
    db.runSync('DELETE FROM sales');
    db.runSync('DELETE FROM expenses');
    db.runSync('DELETE FROM products');
    try {
      db.runSync("DELETE FROM sqlite_sequence WHERE name IN ('products','sales','expenses','clients','debts','debt_payments','stock_movements')");
    } catch (e) {
      // sqlite_sequence may not exist yet; ignore
    }
  });
}

export function getProducts() {
  return db.getAllSync('SELECT * FROM products WHERE is_deleted = 0 ORDER BY name ASC');
}

export function getDistinctCategories(): string[] {
  const rows = db.getAllSync('SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND is_deleted = 0 ORDER BY category ASC') as { category: string }[];
  return rows.map(r => r.category);
}

export function getProductIdsWithDebts(): number[] {
  const rows = db.getAllSync(`
    SELECT DISTINCT s.product_id
    FROM sales s
    JOIN debts d ON d.sale_id = s.id
    WHERE d.status != 'paid' AND s.product_id IS NOT NULL
  `) as { product_id: number }[];
  return rows.map(r => r.product_id);
}

export function calcWeightedPrice(oldStock: number, oldPrice: number, incomingQty: number, incomingPrice: number): number {
  const safeOldStock = Math.max(oldStock, 0); // защита от отрицательного остатка
  const newStock = safeOldStock + incomingQty;
  if (newStock === 0) return oldPrice;
  return (safeOldStock * oldPrice + incomingQty * incomingPrice) / newStock;
}

// Приёмка товара
export function addStockIn(
  productId: number,
  quantity: number,        // в единицах, указанных unitType
  pricePerUnit: number,    // цена за единицу, указанную unitType
  unitType: 'base' | 'package',
  note: string = ''
): void {
  const product = db.getFirstSync('SELECT stock, buy_price, units_per_package FROM products WHERE id = ?', [productId]) as any;
  if (!product) return;

  let qtyBase = quantity;
  let pricePerUnitBase = pricePerUnit;

  if (unitType === 'package') {
    qtyBase = quantity * product.units_per_package;
    pricePerUnitBase = pricePerUnit / product.units_per_package;
  }

  const newBuyPrice = calcWeightedPrice(product.stock, product.buy_price, qtyBase, pricePerUnitBase);
  const movementId = typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).substring(2, 15);
  const now = nowLocalISO();

  db.withTransactionSync(() => {
    db.runSync(
      'UPDATE products SET stock = stock + ?, buy_price = ?, updated_at = ?, synced = 0 WHERE id = ?',
      [qtyBase, newBuyPrice, now, productId]
    );
    db.runSync(
      'INSERT INTO stock_movements (id, product_id, type, quantity_change, price_per_unit, note, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
      [movementId, productId, 'stock_in', qtyBase, pricePerUnitBase, note, now]
    );
  });
}

// Списание брака/порчи
export function addStockWaste(
  productId: number,
  quantity: number,
  note: string = ''
): { success: boolean; currentStock?: number; message?: string } {
  const product = db.getFirstSync('SELECT name, stock, min_stock_alert FROM products WHERE id = ?', [productId]) as any;
  if (!product) return { success: false, message: 'Product not found' };

  if (quantity > product.stock) {
    return {
      success: false,
      currentStock: product.stock,
      message: `Списываете ${quantity}, а на складе только ${product.stock}`,
    };
  }

  const movementId = typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).substring(2, 15);
  const now = nowLocalISO();

  db.withTransactionSync(() => {
    db.runSync(
      'UPDATE products SET stock = stock - ?, updated_at = ?, synced = 0 WHERE id = ?',
      [quantity, now, productId]
    );
    db.runSync(
      'INSERT INTO stock_movements (id, product_id, type, quantity_change, price_per_unit, note, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
      [movementId, productId, 'waste', -quantity, null, note, now]
    );
  });

  const newStock = product.stock - quantity;
  if (newStock <= product.min_stock_alert && product.min_stock_alert > 0) {
    notifyLowStock(product.name, newStock);
  }
  return { success: true, currentStock: newStock };
}

// Инвентаризация (сверка с фактом)
export function addStockCorrection(
  productId: number,
  actualStock: number,
  note: string = ''
): void {
  const product = db.getFirstSync('SELECT stock FROM products WHERE id = ?', [productId]) as any;
  if (!product) return;

  const delta = actualStock - product.stock;
  const movementId = typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).substring(2, 15);
  const now = nowLocalISO();

  db.withTransactionSync(() => {
    db.runSync(
      'UPDATE products SET stock = ?, updated_at = ?, synced = 0 WHERE id = ?',
      [actualStock, now, productId]
    );
    db.runSync(
      'INSERT INTO stock_movements (id, product_id, type, quantity_change, price_per_unit, note, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
      [movementId, productId, 'correction', delta, null, note, now]
    );
  });
}

// История движений товара
export function getStockMovements(productId: number, limit: number = 20) {
  return db.getAllSync(
    'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT ?',
    [productId, limit]
  );
}

export function getLastPurchaseInfo(productId: number): { price_per_unit: number; created_at: string } | null {
  return db.getFirstSync(
    "SELECT price_per_unit, created_at FROM stock_movements WHERE product_id = ? AND type = 'stock_in' ORDER BY created_at DESC LIMIT 1",
    [productId]
  ) as { price_per_unit: number; created_at: string } | null;
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
    let result: any;
    db.withTransactionSync(() => {
      result = db.runSync(
        'INSERT INTO sales (product_id, product_name, quantity, sell_price, buy_price, profit, note, stock_updated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [productId, productName, quantity, sellPrice, buyPrice, profit, note, stockUpdated, nowLocalISO()]
      );
      if (productId) {
        db.runSync('UPDATE products SET stock = stock - ? WHERE id = ?', [quantity, productId]);
      }
    });
    if (productId) {
      const p = db.getFirstSync('SELECT name, stock, min_stock_alert FROM products WHERE id = ?', [productId]) as any;
      if (p && p.stock <= p.min_stock_alert && p.min_stock_alert > 0) {
        notifyLowStock(p.name, p.stock);
      }
    }
    return result;
  } catch (error) {
    console.error('Error adding sale:', error);
    throw error;
  }
}

export function getSalesToday() {
  return db.getAllSync(
    `SELECT * FROM sales WHERE date(created_at) = ? ORDER BY created_at DESC`,
    [todayLocalDate()]
  );
}

export function getSalesByPeriod(days: number, fromDate?: string, toDate?: string) {
  if (fromDate && toDate) {
    return db.getAllSync(
      "SELECT * FROM sales WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) ORDER BY created_at DESC",
      [fromDate, toDate]
    );
  }
  return db.getAllSync(
    "SELECT * FROM sales WHERE created_at >= ? ORDER BY created_at DESC",
    [daysAgoLocalISO(days)]
  );
}

export function deleteSale(saleId: number) {
  try {
    const sale = db.getFirstSync('SELECT * FROM sales WHERE id = ?', [saleId]) as any;
    if (!sale) return;
    let result: any;
    db.withTransactionSync(() => {
      if (sale.product_id && sale.stock_updated === 1) {
        db.runSync('UPDATE products SET stock = stock + ? WHERE id = ?', [sale.quantity, sale.product_id]);
      }
      result = db.runSync('DELETE FROM sales WHERE id = ?', [saleId]);
    });
    if (sale.product_id && sale.stock_updated === 1) {
      const p = db.getFirstSync('SELECT name, stock, min_stock_alert FROM products WHERE id = ?', [sale.product_id]) as any;
      if (p && p.stock <= p.min_stock_alert && p.min_stock_alert > 0) {
        notifyLowStock(p.name, p.stock);
      }
    }
    return result;
  } catch (error) {
    console.error('Error deleting sale:', error);
    throw error;
  }
}

// Статистика
export function getStats(days: number = 1, fromDate?: string, toDate?: string) {
  if (fromDate && toDate) {
    const result = db.getFirstSync(`
      SELECT
        COALESCE(SUM(sell_price * quantity), 0) as revenue,
        COALESCE(SUM(profit), 0) as profit,
        COALESCE(COUNT(*), 0) as count
      FROM sales
      WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
    `, [fromDate, toDate]) as any;
    return result;
  }
  const result = db.getFirstSync(`
    SELECT 
      COALESCE(SUM(sell_price * quantity), 0) as revenue,
      COALESCE(SUM(profit), 0) as profit,
      COALESCE(COUNT(*), 0) as count
    FROM sales 
    WHERE created_at >= ?
  `, [daysAgoLocalISO(days)]) as any;
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
      'INSERT INTO expenses (type, category, amount, description, user_id, linked_product_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [type, category, amount, description, userId, linkedProductId, nowLocalISO()]
    );
  } catch (error) {
    console.error('Error adding expense:', error);
    throw error;
  }
}

export function getExpenses(days: number = 1) {
  return db.getAllSync(
    "SELECT * FROM expenses WHERE created_at >= ? ORDER BY created_at DESC",
    [daysAgoLocalISO(days)]
  );
}

export function deleteExpense(id: number) {
  return db.runSync('DELETE FROM expenses WHERE id = ?', [id]);
}

export function getExpenseStats(days: number = 1, fromDate?: string, toDate?: string) {
  if (fromDate && toDate) {
    const result = db.getFirstSync(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'operational' THEN amount ELSE 0 END), 0) as operational,
        COALESCE(SUM(CASE WHEN type = 'inventory' THEN amount ELSE 0 END), 0) as inventory,
        COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
    `, [fromDate, toDate]) as any;
    return result;
  }
  const result = db.getFirstSync(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'operational' THEN amount ELSE 0 END), 0) as operational,
      COALESCE(SUM(CASE WHEN type = 'inventory' THEN amount ELSE 0 END), 0) as inventory,
      COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE created_at >= ?
  `, [daysAgoLocalISO(days)]) as any;
  return result;
}

const safeNum = (v: any, def = 0) =>
  isFinite(parseFloat(v)) ? parseFloat(v) : def;
const safeStr = (v: any, def: any = '') =>
  typeof v === 'string' ? (v === 'null' ? def : v.slice(0, 500)) : (v === null || v === undefined ? def : String(v).slice(0, 500));

export function importBackupData(data: any) {
  db.withTransactionSync(() => {
    // Clear all existing data
    db.runSync('DELETE FROM debt_payments');
    db.runSync('DELETE FROM debts');
    db.runSync('DELETE FROM clients');
    db.runSync('DELETE FROM sales');
    db.runSync('DELETE FROM products');
    db.runSync('DELETE FROM expenses');
    db.runSync('DELETE FROM stock_movements');
    try {
      db.runSync("DELETE FROM sqlite_sequence WHERE name IN ('products','sales','expenses','clients','debts','debt_payments','stock_movements')");
    } catch (e) {}

    // Import products
    if (Array.isArray(data.products)) {
      data.products.forEach((p: any) => {
        db.runSync(
          `INSERT INTO products (
            id, name, buy_price, sell_price, stock, min_stock_alert,
            base_unit, has_packages, package_name, units_per_package,
            category, updated_at, synced, is_deleted, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id, safeStr(p.name), safeNum(p.buy_price), safeNum(p.sell_price), safeNum(p.stock), safeNum(p.min_stock_alert, 0),
            safeStr(p.base_unit, 'шт'), safeNum(p.has_packages, 0), safeStr(p.package_name, null), safeNum(p.units_per_package, 1),
            safeStr(p.category, null), safeStr(p.updated_at, nowLocalISO()), safeNum(p.synced, 0), safeNum(p.is_deleted, 0), safeStr(p.created_at, nowLocalISO())
          ]
        );
      });
    }

    // Import sales
    if (Array.isArray(data.sales)) {
      data.sales.forEach((s: any) => {
        db.runSync(
          `INSERT INTO sales (
            id, product_id, product_name, quantity, sell_price, buy_price, profit, note, stock_updated, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            s.id, s.product_id, safeStr(s.product_name), safeNum(s.quantity), safeNum(s.sell_price), safeNum(s.buy_price), safeNum(s.profit), safeStr(s.note, null), safeNum(s.stock_updated, 0), safeStr(s.created_at)
          ]
        );
      });
    }

    // Import expenses
    if (Array.isArray(data.expenses)) {
      data.expenses.forEach((e: any) => {
        db.runSync(
          `INSERT INTO expenses (id, type, category, amount, description, linked_product_id, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            e.id, safeStr(e.type), safeStr(e.category), safeNum(e.amount), safeStr(e.description, null), e.linked_product_id, safeStr(e.created_at), safeStr(e.user_id)
          ]
        );
      });
    }
  });
}

export function getAnnualStats() {
  const year = new Date().getFullYear();

  const monthlySales = db.getAllSync(`
    SELECT
      CAST(strftime('%m', created_at) AS INTEGER) as month,
      SUM(sell_price * quantity) as revenue,
      SUM(profit) as profit,
      COUNT(*) as salesCount
    FROM sales
    WHERE strftime('%Y', created_at) = ?
    GROUP BY month
  `, [String(year)]) as any[];

  const monthlyExpenses = db.getAllSync(`
    SELECT
      CAST(strftime('%m', created_at) AS INTEGER) as month,
      SUM(amount) as total
    FROM expenses
    WHERE strftime('%Y', created_at) = ?
    GROUP BY month
  `, [String(year)]) as any[];

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const s = monthlySales.find(ms => ms.month === m);
    const e = monthlyExpenses.find(me => me.month === m);
    months.push({
      month: m,
      revenue: s?.revenue || 0,
      profit: s?.profit || 0,
      salesCount: s?.salesCount || 0,
      expenses: e?.total || 0,
      netProfit: (s?.profit || 0) - (e?.total || 0),
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
    WHERE date(created_at) >= ?
    GROUP BY product_name
    ORDER BY totalProfit DESC
    LIMIT 10
  `, [`${year}-01-01`]) as any[];

  // Year totals
  const totals = db.getFirstSync(`
    SELECT
      COALESCE(SUM(sell_price * quantity), 0) as revenue,
      COALESCE(SUM(profit), 0) as profit,
      COALESCE(COUNT(*), 0) as salesCount
    FROM sales
    WHERE strftime('%Y', created_at) = ?
  `, [String(year)]) as any;

  const totalExpenses = db.getFirstSync(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE strftime('%Y', created_at) = ?
  `, [String(year)]) as any;

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

// ── Clients ──────────────────────────────────────────

export function searchClients(query: string) {
  if (!query.trim()) {
    return db.getAllSync(`
      SELECT c.*, COUNT(d.id) as debt_count
      FROM clients c
      LEFT JOIN debts d ON d.client_id = c.id
      GROUP BY c.id
      ORDER BY debt_count DESC, c.updated_at DESC
      LIMIT 8
    `);
  }
  return db.getAllSync(
    "SELECT * FROM clients WHERE name LIKE ? || '%' ORDER BY name ASC LIMIT 8",
    [query]
  );
}

export function upsertClient(name: string, phone: string = '', note: string = ''): number {
  const existing = db.getFirstSync(
    'SELECT id FROM clients WHERE name = ?',
    [name]
  ) as any;
  if (existing) {
    db.runSync(
      'UPDATE clients SET phone = ?, updated_at = ? WHERE id = ?',
      [phone || existing.phone, nowLocalISO(), existing.id]
    );
    return existing.id;
  }
  const result = db.runSync(
    'INSERT INTO clients (name, phone, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [name, phone, note, nowLocalISO(), nowLocalISO()]
  );
  return result.lastInsertRowId;
}

// ── Debts ─────────────────────────────────────────────

export function addDebt(
  clientId: number,
  saleId: number | null,
  amountTotal: number,
  amountPaid: number = 0,
  note: string = '',
  dueDate: string = ''
) {
  const now = nowLocalISO();
  return db.runSync(
    `INSERT INTO debts
       (client_id, sale_id, amount_total, amount_paid, status, due_date, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    [clientId, saleId, amountTotal, amountPaid, dueDate || null, note, now, now]
  );
}

export function getDebtsWithClients() {
  return db.getAllSync(`
    SELECT
      d.*,
      c.name  AS client_name,
      c.phone AS client_phone,
      (d.amount_total - d.amount_paid) AS remaining
    FROM debts d
    JOIN clients c ON c.id = d.client_id
    WHERE d.status != 'paid'
    ORDER BY d.created_at DESC
  `);
}

export function getDebtSummary(): { total_remaining: number; debtor_count: number } {
  const result = db.getFirstSync(`
    SELECT
      COALESCE(SUM(amount_total - amount_paid), 0) AS total_remaining,
      COUNT(DISTINCT client_id)                     AS debtor_count
    FROM debts
    WHERE status != 'paid'
  `) as any;
  return result ?? { total_remaining: 0, debtor_count: 0 };
}

export function getDebtsByClient(clientId: number) {
  return db.getAllSync(
    `SELECT * FROM debts WHERE client_id = ? ORDER BY created_at DESC`,
    [clientId]
  );
}

export function recordDebtPayment(debtId: number, amount: number, note: string = '') {
  const debt = db.getFirstSync('SELECT * FROM debts WHERE id = ?', [debtId]) as any;
  if (!debt) return;
  const remaining = debt.amount_total - debt.amount_paid;
  const actualAmount = Math.min(amount, remaining);
  const newPaid = debt.amount_paid + actualAmount;
  const newStatus = newPaid >= debt.amount_total ? 'paid' : 'active';
  const now = nowLocalISO();
  db.withTransactionSync(() => {
    db.runSync(
      'UPDATE debts SET amount_paid = ?, status = ?, updated_at = ? WHERE id = ?',
      [newPaid, newStatus, now, debtId]
    );
    db.runSync(
      'INSERT INTO debt_payments (debt_id, amount, note, created_at) VALUES (?, ?, ?, ?)',
      [debtId, actualAmount, note, now]
    );
  });
  return { actualAmount, overpayment: amount - actualAmount };
}

export function getDebtPayments(debtId: number) {
  return db.getAllSync(
    'SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY created_at DESC',
    [debtId]
  );
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
          (SELECT MAX(s.created_at) FROM sales s WHERE s.product_id = p.id) as lastSoldAt,
          p.base_unit, p.has_packages, p.package_name, p.units_per_package
        FROM products p
        WHERE p.is_deleted = 0
        UNION ALL
        SELECT
          NULL as id,
          s.product_name as name,
          'history' as source,
          (SELECT s2.buy_price FROM sales s2 WHERE s2.product_name = s.product_name AND s2.product_id IS NULL ORDER BY s2.created_at DESC LIMIT 1) as purchasePrice,
          (SELECT s2.sell_price FROM sales s2 WHERE s2.product_name = s.product_name AND s2.product_id IS NULL ORDER BY s2.created_at DESC LIMIT 1) as lastSalePrice,
          COUNT(*) as salesCount,
          MAX(s.created_at) as lastSoldAt,
          'шт' as base_unit, 0 as has_packages, NULL as package_name, 1 as units_per_package
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
        (SELECT MAX(s.created_at) FROM sales s WHERE s.product_id = p.id) as lastSoldAt,
        p.base_unit, p.has_packages, p.package_name, p.units_per_package
      FROM products p
      WHERE p.name LIKE ? || '%' AND p.is_deleted = 0
    ),
    HistoryMatches AS (
      SELECT
        NULL as id,
        s.product_name as name,
        'history' as source,
        (SELECT s2.buy_price FROM sales s2 WHERE s2.product_name = s.product_name AND s2.product_id IS NULL ORDER BY s2.created_at DESC LIMIT 1) as purchasePrice,
        (SELECT s2.sell_price FROM sales s2 WHERE s2.product_name = s.product_name AND s2.product_id IS NULL ORDER BY s2.created_at DESC LIMIT 1) as lastSalePrice,
        COUNT(*) as salesCount,
        MAX(s.created_at) as lastSoldAt,
        'шт' as base_unit, 0 as has_packages, NULL as package_name, 1 as units_per_package
      FROM sales s
      WHERE s.product_id IS NULL
        AND s.product_name LIKE ? || '%'
        AND s.product_name NOT IN (SELECT name FROM products)
      GROUP BY s.product_name
    )
    SELECT * FROM (
      SELECT * FROM CatalogMatches
      UNION ALL
      SELECT * FROM HistoryMatches
    ) AS CombinedResults
    ORDER BY
      CASE WHEN source = 'catalog' THEN 0 ELSE 1 END,
      salesCount DESC,
      lastSoldAt DESC
    LIMIT 8
  `, [query, query]);
}

export default db;