import * as SQLite from 'expo-sqlite';
import { notifyLowStock } from '../utils/notifications';

const db = SQLite.openDatabaseSync('savdo.db'); // Note: Database name remains 'savdo.db' to maintain data continuity.

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

function runMigrations() {
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
      buy_price REAL,
      profit REAL,
      note TEXT,
      stock_updated INTEGER DEFAULT 0,
      created_at TEXT,
      is_pending_review INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0,
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
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
  `);

  // One-time schema migrations (skipped on subsequent launches)
  db.execSync('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)');

  const schemaMigrationDone = db.getFirstSync(
    "SELECT value FROM app_meta WHERE key = 'schema_v2'"
  ) as { value: string } | null;

  if (!schemaMigrationDone) {
    db.withTransactionSync(() => {
      const tableInfo = db.getAllSync("PRAGMA table_info(products)") as any[];
      const salesTableInfo = db.getAllSync("PRAGMA table_info(sales)") as any[];
      const debtCols = db.getAllSync("PRAGMA table_info(debts)") as any[];

      // products columns
      const productsCols = [
        { name: 'min_stock_alert', type: 'INTEGER DEFAULT 0' },
        { name: 'base_unit', type: "TEXT DEFAULT 'шт'" },
        { name: 'has_packages', type: 'INTEGER DEFAULT 0' },
        { name: 'package_name', type: 'TEXT' },
        { name: 'units_per_package', type: 'REAL DEFAULT 1' },
        { name: 'updated_at', type: 'TEXT' },
        { name: 'synced', type: 'INTEGER DEFAULT 0' },
        { name: 'is_deleted', type: 'INTEGER DEFAULT 0' },
        { name: 'category', type: 'TEXT' },
        { name: 'remote_id', type: 'TEXT' },
      ];
      productsCols.forEach(col => {
        if (!tableInfo.some(c => c.name === col.name)) {
          db.execSync(`ALTER TABLE products ADD COLUMN ${col.name} ${col.type}`);
        }
      });

      // sales columns
      const salesCols = [
        { name: 'stock_updated', type: 'INTEGER DEFAULT 0' },
        { name: 'seller_id', type: 'TEXT' },
        { name: 'seller_name', type: 'TEXT' },
        { name: 'stock_warning', type: 'INTEGER DEFAULT 0' },
        { name: 'remote_id', type: 'TEXT' },
      ];
      salesCols.forEach(col => {
        if (!salesTableInfo.some(c => c.name === col.name)) {
          db.execSync(`ALTER TABLE sales ADD COLUMN ${col.name} ${col.type}`);
        }
      });

      // debts columns
      if (!debtCols.some(c => c.name === 'notification_id')) {
        db.runSync("ALTER TABLE debts ADD COLUMN notification_id TEXT");
      }

      db.runSync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_v2', 'done')");
    });
  }

  const schemaV3MigrationDone = db.getFirstSync(
    "SELECT value FROM app_meta WHERE key = 'schema_v3'"
  ) as { value: string } | null;

  if (!schemaV3MigrationDone) {
    db.withTransactionSync(() => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id INTEGER,
          seller_id TEXT,
          seller_name TEXT,
          total_amount REAL NOT NULL,
          payment_type TEXT,
          status TEXT DEFAULT 'completed',
          note TEXT,
          created_at TEXT,
          FOREIGN KEY (client_id) REFERENCES clients(id)
        );
      `);

      const productsTableInfo = db.getAllSync("PRAGMA table_info(products)") as any[];
      const salesTableInfo = db.getAllSync("PRAGMA table_info(sales)") as any[];
      const debtsTableInfo = db.getAllSync("PRAGMA table_info(debts)") as any[];

      if (!productsTableInfo.some(c => c.name === 'article')) {
        db.execSync("ALTER TABLE products ADD COLUMN article TEXT");
      }
      if (!productsTableInfo.some(c => c.name === 'is_continuous')) {
        db.execSync("ALTER TABLE products ADD COLUMN is_continuous INTEGER DEFAULT 0");
      }
      if (!salesTableInfo.some(c => c.name === 'order_id')) {
        db.execSync("ALTER TABLE sales ADD COLUMN order_id INTEGER");
      }
      if (!debtsTableInfo.some(c => c.name === 'order_id')) {
        db.execSync("ALTER TABLE debts ADD COLUMN order_id INTEGER");
      }

      db.runSync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_v3', 'done')");
    });
  }

  const schemaV4MigrationDone = db.getFirstSync(
    "SELECT value FROM app_meta WHERE key = 'schema_v4'"
  ) as { value: string } | null;

  if (!schemaV4MigrationDone) {
    db.withTransactionSync(() => {
      // Recreate sales table to make buy_price and profit nullable and add is_pending_review
      db.execSync(`
        CREATE TABLE sales_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER,
          product_name TEXT,
          quantity INTEGER DEFAULT 1,
          sell_price REAL NOT NULL,
          buy_price REAL,
          profit REAL,
          note TEXT,
          stock_updated INTEGER DEFAULT 0,
          created_at TEXT,
          seller_id TEXT,
          seller_name TEXT,
          stock_warning INTEGER DEFAULT 0,
          remote_id TEXT,
          order_id INTEGER,
          is_pending_review INTEGER DEFAULT 0,
          synced INTEGER DEFAULT 0,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
      `);

      // Copy data from old table to new table
      const columns = [
        'id', 'product_id', 'product_name', 'quantity', 'sell_price', 'buy_price',
        'profit', 'note', 'stock_updated', 'created_at', 'seller_id', 'seller_name',
        'stock_warning', 'remote_id', 'order_id'
      ];

      // Check which columns actually exist in the current sales table
      const tableInfo = db.getAllSync("PRAGMA table_info(sales)") as any[];
      const existingCols = columns.filter(c => tableInfo.some(ti => ti.name === c));
      const colsStr = existingCols.join(', ');

      db.execSync(`INSERT INTO sales_new (${colsStr}) SELECT ${colsStr} FROM sales`);
      db.execSync('DROP TABLE sales');
      db.execSync('ALTER TABLE sales_new RENAME TO sales');

      // Recreate indexes
      db.execSync('CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id)');
      db.execSync('CREATE INDEX IF NOT EXISTS idx_sales_product_name ON sales(product_name)');
      db.execSync('CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)');

      db.runSync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_v4', 'done')");
    });
  }

  const schemaV5MigrationDone = db.getFirstSync(
    "SELECT value FROM app_meta WHERE key = 'schema_v5'"
  ) as { value: string } | null;

  if (!schemaV5MigrationDone) {
    db.withTransactionSync(() => {
      const cols = db.getAllSync("PRAGMA table_info(products)") as any[];
      if (!cols.some(c => c.name === 'color')) {
        db.execSync("ALTER TABLE products ADD COLUMN color TEXT");
      }
      if (!cols.some(c => c.name === 'article')) {
        db.execSync("ALTER TABLE products ADD COLUMN article TEXT");
      }
      db.runSync(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_v5', 'done')"
      );
    });
  }

  const schemaV6MigrationDone = db.getFirstSync(
    "SELECT value FROM app_meta WHERE key = 'schema_v6'"
  ) as { value: string } | null;

  if (!schemaV6MigrationDone) {
    db.withTransactionSync(() => {
      const cols = db.getAllSync("PRAGMA table_info(products)") as any[];
      if (!cols.some(c => c.name === 'initial_stock')) {
        db.execSync("ALTER TABLE products ADD COLUMN initial_stock REAL");
      }
      if (!cols.some(c => c.name === 'initial_buy_price')) {
        db.execSync("ALTER TABLE products ADD COLUMN initial_buy_price REAL");
      }
      // Бэкфилл для уже существующих товаров: точной истории у нас нет,
      // поэтому фиксируем текущие значения как отправную точку — дальше они статичны.
      db.execSync(`
        UPDATE products
        SET initial_stock = stock, initial_buy_price = buy_price
        WHERE initial_stock IS NULL
      `);
      db.runSync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_v6', 'done')");
    });
  }

  const schemaV7MigrationDone = db.getFirstSync(
    "SELECT value FROM app_meta WHERE key = 'schema_v7'"
  ) as { value: string } | null;

  if (!schemaV7MigrationDone) {
    db.withTransactionSync(() => {
      // Recreate sales table to add synced column and make sure schema is clean
      db.execSync(`
        CREATE TABLE sales_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER,
          product_name TEXT,
          quantity INTEGER DEFAULT 1,
          sell_price REAL NOT NULL,
          buy_price REAL,
          profit REAL,
          note TEXT,
          stock_updated INTEGER DEFAULT 0,
          created_at TEXT,
          seller_id TEXT,
          seller_name TEXT,
          stock_warning INTEGER DEFAULT 0,
          remote_id TEXT,
          order_id INTEGER,
          is_pending_review INTEGER DEFAULT 0,
          synced INTEGER DEFAULT 0,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
      `);

      const columns = [
        'id', 'product_id', 'product_name', 'quantity', 'sell_price', 'buy_price',
        'profit', 'note', 'stock_updated', 'created_at', 'seller_id', 'seller_name',
        'stock_warning', 'remote_id', 'order_id', 'is_pending_review'
      ];

      const tableInfo = db.getAllSync("PRAGMA table_info(sales)") as any[];
      const existingCols = columns.filter(c => tableInfo.some(ti => ti.name === c));
      const colsStr = existingCols.join(', ');

      db.execSync(`INSERT INTO sales_new (${colsStr}) SELECT ${colsStr} FROM sales`);
      db.execSync('DROP TABLE sales');
      db.execSync('ALTER TABLE sales_new RENAME TO sales');

      // Recreate indexes
      db.execSync('CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id)');
      db.execSync('CREATE INDEX IF NOT EXISTS idx_sales_product_name ON sales(product_name)');
      db.execSync('CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)');

      db.runSync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_v7', 'done')");
    });
  }

  {
    const schemaV8MigrationDone = db.getFirstSync(
      "SELECT value FROM app_meta WHERE key = 'schema_v8'"
    ) as { value: string } | null;

    if (!schemaV8MigrationDone) {
      db.withTransactionSync(() => {
        const movementCols = db.getAllSync("PRAGMA table_info(stock_movements)") as any[];
        if (!movementCols.some(c => c.name === 'seller_id')) {
          db.execSync("ALTER TABLE stock_movements ADD COLUMN seller_id TEXT");
        }
        if (!movementCols.some(c => c.name === 'seller_name')) {
          db.execSync("ALTER TABLE stock_movements ADD COLUMN seller_name TEXT");
        }
        db.runSync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_v8', 'done')");
      });
    }
  }

  {
    const schemaV9MigrationDone = db.getFirstSync(
      "SELECT value FROM app_meta WHERE key = 'schema_v9'"
    ) as { value: string } | null;

    if (!schemaV9MigrationDone) {
      db.withTransactionSync(() => {
        db.execSync(`
          CREATE TABLE IF NOT EXISTS shift_checkins (
            local_date TEXT PRIMARY KEY,
            method TEXT NOT NULL,
            gps_lat REAL,
            gps_lng REAL,
            nfc_tag_uid TEXT,
            qr_token TEXT,
            created_at TEXT,
            synced INTEGER DEFAULT 0,
            server_status TEXT DEFAULT 'pending',
            server_error TEXT
          );
        `);
        db.runSync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_v9', 'done')");
      });
    }
  }

  // Migration: shop_session table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS shop_session (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Migration: timezone shift + one-time migration check
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

// Схема и миграции выполняются синхронно прямо при загрузке этого модуля —
// то есть до того, как React успеет смонтировать хотя бы один компонент.
// Это критично: контексты (ShopContext, и т.п.) читают из БД в своих
// собственных useEffect при монтировании, а эффекты дочерних компонентов
// в React срабатывают раньше, чем эффект родителя (App), который вызывал
// initDatabase() из useEffect. На первом холодном запуске после установки
// таблицы могли ещё не существовать в момент такого раннего чтения —
// "no such table: shop_session" и подобные ошибки. Выполняя миграции здесь,
// на этапе импорта модуля, мы гарантируем, что таблицы уже существуют
// до того, как какой-либо код (включая контексты) успеет их прочитать,
// независимо от порядка срабатывания React-эффектов.
let moduleInitError: Error | null = null;
try {
  runMigrations();
} catch (e) {
  moduleInitError = e instanceof Error ? e : new Error(String(e));
  console.error('[database] Migration failed on module load:', e);
}

// Сохраняем публичную функцию initDatabase() для обратной совместимости:
// App.tsx вызывает её в useEffect и по результату решает, показывать ли
// экран ошибки БД (dbError). Миграции уже выполнены выше, здесь только
// пробрасываем сохранённую ошибку, если она была.
export function initDatabase() {
  if (moduleInitError) {
    throw moduleInitError;
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
  category: string | null = null,
  isContinuous: number = 0,
  article: string | null = null,
  color: string | null = null
) {
  try {
    const now = nowLocalISO();
    const result = db.runSync(
      `INSERT INTO products (
        name, buy_price, sell_price, stock, min_stock_alert,
        base_unit, has_packages, package_name, units_per_package,
        category, updated_at, synced, is_deleted, created_at, is_continuous,
        article, color, initial_stock, initial_buy_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)`,
      [name, buyPrice, sellPrice, stock, minStockAlert, baseUnit, hasPackages, packageName, unitsPerPackage, category, now, now, isContinuous, article, color, stock, buyPrice]
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

// Поля товара, изменения которых фиксируются в истории редактирования
const EDIT_TRACKED_FIELDS = [
  'name', 'category', 'buy_price', 'sell_price', 'stock', 'min_stock_alert',
  'base_unit', 'article', 'color', 'package_name', 'units_per_package', 'is_continuous',
] as const;

function normalizeEditVal(v: any): string | number {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return v;
  return String(v).trim();
}

export type ProductEditDiffEntry = { field: string; old: any; new: any };

// Пишет запись в stock_movements (type='edit') с структурированным описанием
// изменений — если поля товара реально изменились. Не должна ломать основное
// обновление товара при любой внутренней ошибке.
function logProductEditHistory(before: any, after: Record<string, any>) {
  try {
    const diff: ProductEditDiffEntry[] = [];
    for (const field of EDIT_TRACKED_FIELDS) {
      // Поля упаковки не считаем изменившимися, если упаковки не использовались ни до, ни после
      if ((field === 'package_name' || field === 'units_per_package') && !before.has_packages && !after.has_packages) {
        continue;
      }
      const oldVal = normalizeEditVal(before[field]);
      const newVal = normalizeEditVal(after[field]);
      if (oldVal !== newVal) {
        diff.push({ field, old: before[field], new: after[field] });
      }
    }
    if (diff.length === 0) return;

    const stockChanged = diff.some(d => d.field === 'stock');
    const quantityChange = stockChanged ? (Number(after.stock) - Number(before.stock)) : 0;

    const movementId = typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).substring(2, 15);

    db.runSync(
      'INSERT INTO stock_movements (id, product_id, type, quantity_change, price_per_unit, note, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
      [movementId, before.id, 'edit', quantityChange, null, JSON.stringify(diff), nowLocalISO()]
    );
  } catch (e) {
    console.error('Error logging product edit history:', e);
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
  category: string | null = null,
  isContinuous: number = 0,
  article: string | null = null,
  color: string | null = null
) {
  try {
    const before = db.getFirstSync('SELECT * FROM products WHERE id = ?', [id]) as any;

    const result = db.runSync(
      `UPDATE products SET
        name = ?, buy_price = ?, sell_price = ?, stock = ?, min_stock_alert = ?,
        base_unit = ?, has_packages = ?, package_name = ?, units_per_package = ?,
        category = ?, updated_at = ?, synced = 0, is_continuous = ?,
        article = ?, color = ?
      WHERE id = ?`,
      [name, buyPrice, sellPrice, stock, minStockAlert, baseUnit, hasPackages, packageName, unitsPerPackage, category, nowLocalISO(), isContinuous, article, color, id]
    );

    if (before) {
      logProductEditHistory(before, {
        id, name, category, buy_price: buyPrice, sell_price: sellPrice, stock,
        min_stock_alert: minStockAlert, base_unit: baseUnit, has_packages: hasPackages,
        package_name: packageName, units_per_package: unitsPerPackage,
        is_continuous: isContinuous, article, color,
      });
    }

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

export function getUnsyncedSales() {
  return db.getAllSync('SELECT * FROM sales WHERE synced = 0 ORDER BY created_at ASC');
}

export function getAllProductsForSync() {
  return db.getAllSync('SELECT * FROM products ORDER BY name ASC');
}

export function getProductsForSync() {
  // Returns unsynced products including soft-deleted ones, for sync purposes
  return db.getAllSync('SELECT * FROM products WHERE synced = 0 ORDER BY name ASC');
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
  note: string = '',
  sellerId: string | null = null,
  sellerName: string | null = null
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
      'INSERT INTO stock_movements (id, product_id, type, quantity_change, price_per_unit, note, created_at, synced, seller_id, seller_name) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
      [movementId, productId, 'stock_in', qtyBase, pricePerUnitBase, note, now, sellerId, sellerName]
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
  note: string = '',
  isPendingReview: number = 0
) {
  const profit = (sellPrice - buyPrice) * quantity;
  const stockUpdated = productId ? 1 : 0;
  try {
    let result: any;
    db.withTransactionSync(() => {
      result = db.runSync(
        'INSERT INTO sales (product_id, product_name, quantity, sell_price, buy_price, profit, note, stock_updated, created_at, is_pending_review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [productId, productName, quantity, sellPrice, buyPrice, profit, note, stockUpdated, nowLocalISO(), isPendingReview]
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

export function getExpenses(days: number = 1, fromDate?: string, toDate?: string) {
  if (fromDate && toDate) {
    return db.getAllSync(
      "SELECT * FROM expenses WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) ORDER BY created_at DESC",
      [fromDate, toDate]
    );
  }
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
      netProfit: (s?.revenue || 0) - (e?.total || 0),
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
      netProfit: (totals?.revenue || 0) - (totalExpenses?.total || 0),
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

export function getAllClientsWithStats(): any[] {
  return db.getAllSync(`
    SELECT
      c.id, c.name, c.phone, c.note, c.created_at, c.updated_at,
      COALESCE(SUM(CASE WHEN d.status = 'active' THEN d.amount_total - d.amount_paid ELSE 0 END), 0) AS active_debt,
      COUNT(CASE WHEN d.status = 'active' THEN 1 END) AS active_debt_count,
      MAX(d.created_at) AS last_activity
    FROM clients c
    LEFT JOIN debts d ON d.client_id = c.id
    GROUP BY c.id, c.name, c.phone, c.note, c.created_at, c.updated_at
    ORDER BY last_activity DESC
  `);
}

export function updateClient(
  id: number, name: string, phone: string, note: string = ''
): void {
  db.runSync(
    'UPDATE clients SET name = ?, phone = ?, note = ?, updated_at = ? WHERE id = ?',
    [name.trim(), phone.trim(), note.trim(), nowLocalISO(), id]
  );
}

export function deleteClientIfSafe(id: number): boolean {
  const hasDebts = db.getFirstSync(
    'SELECT id FROM debts WHERE client_id = ? AND status = "active" LIMIT 1',
    [id]
  );
  if (hasDebts) return false;
  db.runSync('DELETE FROM clients WHERE id = ?', [id]);
  return true;
}

// ── Debts ─────────────────────────────────────────────

export function addDebt(
  clientId: number,
  saleId: number | null,
  amountTotal: number,
  amountPaid: number = 0,
  note: string = '',
  dueDate: string = '',
  orderId: number | null = null
) {
  const now = nowLocalISO();
  return db.runSync(
    `INSERT INTO debts
       (client_id, sale_id, amount_total, amount_paid, status, due_date, note, created_at, updated_at, order_id)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [clientId, saleId, amountTotal, amountPaid, dueDate || null, note, now, now, orderId]
  );
}

export function getDebtsWithClients() {
  return db.getAllSync(`
    SELECT
      d.*,
      c.name AS client_name,
      c.phone AS client_phone,
      (d.amount_total - d.amount_paid) AS remaining,
      COALESCE(
        s.product_name,
        (SELECT GROUP_CONCAT(product_name, ', ') FROM sales WHERE order_id = d.order_id)
      ) AS product_name_from_sale
    FROM debts d
    JOIN clients c ON c.id = d.client_id
    LEFT JOIN sales s ON s.id = d.sale_id
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

export function getDebtById(id: number) {
  return db.getFirstSync('SELECT * FROM debts WHERE id = ?', [id]);
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

export function deleteDebt(debtId: number) {
  // Используем существующий объект БД (db)
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM debt_payments WHERE debt_id = ?', [debtId]);
    db.runSync('DELETE FROM debts WHERE id = ?', [debtId]);
  });
}

export function updateDebtNotificationId(debtId: number, notifId: string | null) {
  db.runSync('UPDATE debts SET notification_id = ? WHERE id = ?', [notifId, debtId]);
}

export function getOverdueDebts() {
  const today = todayLocalDate();
  return db.getAllSync(`
    SELECT d.*, c.name AS client_name, c.phone AS client_phone, (d.amount_total - d.amount_paid) AS remaining
    FROM debts d
    JOIN clients c ON c.id = d.client_id
    WHERE d.status != 'paid'
      AND d.due_date IS NOT NULL
      AND d.due_date < ?
    ORDER BY d.due_date ASC
  `, [today]);
}

export function getDebtPayments(debtId: number) {
  return db.getAllSync(
    'SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY created_at DESC',
    [debtId]
  );
}

export function getProductSalesStats(productId: number) {
  return db.getFirstSync(`
    SELECT
      COALESCE(SUM(quantity), 0) as total_sold,
      COALESCE(SUM(sell_price * quantity), 0) as total_revenue,
      COALESCE(SUM(profit), 0) as total_profit
    FROM sales
    WHERE product_id = ?
  `, [productId]) as { total_sold: number; total_revenue: number; total_profit: number };
}

export function getProductSalesHistory(productId: number, limit: number = 20) {
  return db.getAllSync(
    'SELECT * FROM sales WHERE product_id = ? ORDER BY created_at DESC LIMIT ?',
    [productId, limit]
  );
}

export function getUnregisteredProductsFromHistory() {
  return db.getAllSync(`
    SELECT
      product_name as name,
      COUNT(*) as sales_count,
      AVG(sell_price) as avg_sell_price,
      AVG(buy_price) as avg_buy_price,
      MAX(sell_price) as last_sell_price,
      MAX(buy_price) as last_buy_price
    FROM sales
    WHERE product_id IS NULL
      AND product_name NOT IN (SELECT name FROM products WHERE is_deleted = 0)
    GROUP BY product_name
    ORDER BY sales_count DESC
  `);
}

export function getClientDebtHistory(clientId: number) {
  // Все долги клиента (включая погашенные) с инфо о продаже
  return db.getAllSync(`
    SELECT
      d.*,
      s.product_name,
      s.quantity,
      s.sell_price,
      (d.amount_total - d.amount_paid) AS remaining
    FROM debts d
    LEFT JOIN sales s ON s.id = d.sale_id
    WHERE d.client_id = ?
    ORDER BY d.created_at DESC
  `, [clientId]);
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
          p.base_unit, p.has_packages, p.package_name, p.units_per_package, p.is_continuous, p.stock,
          p.article, p.color,
          CASE WHEN p.color IS NOT NULL AND p.color != ''
               THEN p.name || ' · ' || p.color
               ELSE p.name
          END AS displayName
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
          'шт' as base_unit, 0 as has_packages, NULL as package_name, 1 as units_per_package, 0 as is_continuous, 0 as stock,
          NULL as article, NULL as color,
          s.product_name as displayName
        FROM sales s
        WHERE s.product_id IS NULL
          AND s.product_name NOT IN (SELECT name FROM products)
        GROUP BY s.product_name
      )
      SELECT id, displayName as name, source, purchasePrice, lastSalePrice, salesCount, lastSoldAt, base_unit, has_packages, package_name, units_per_package, is_continuous, stock, article, color, name as baseName FROM AllItems
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
        p.name as baseName,
        'catalog' as source,
        p.buy_price as purchasePrice,
        (SELECT s.sell_price FROM sales s WHERE s.product_id = p.id ORDER BY s.created_at DESC LIMIT 1) as lastSalePrice,
        (SELECT COUNT(*) FROM sales s WHERE s.product_id = p.id) as salesCount,
        (SELECT MAX(s.created_at) FROM sales s WHERE s.product_id = p.id) as lastSoldAt,
        p.base_unit, p.has_packages, p.package_name, p.units_per_package, p.is_continuous, p.stock,
        p.article, p.color,
        CASE WHEN p.color IS NOT NULL AND p.color != ''
             THEN p.name || ' · ' || p.color
             ELSE p.name
        END AS displayName
      FROM products p
      WHERE (p.name LIKE ? || '%' OR p.article LIKE ? || '%') AND p.is_deleted = 0
    ),
    HistoryMatches AS (
      SELECT
        NULL as id,
        s.product_name as name,
        s.product_name as baseName,
        'history' as source,
        (SELECT s2.buy_price FROM sales s2 WHERE s2.product_name = s.product_name AND s2.product_id IS NULL ORDER BY s2.created_at DESC LIMIT 1) as purchasePrice,
        (SELECT s2.sell_price FROM sales s2 WHERE s2.product_name = s.product_name AND s2.product_id IS NULL ORDER BY s2.created_at DESC LIMIT 1) as lastSalePrice,
        COUNT(*) as salesCount,
        MAX(s.created_at) as lastSoldAt,
        'шт' as base_unit, 0 as has_packages, NULL as package_name, 1 as units_per_package, 0 as is_continuous, 0 as stock,
        NULL as article, NULL as color,
        s.product_name as displayName
      FROM sales s
      WHERE s.product_id IS NULL
        AND s.product_name LIKE ? || '%'
        AND s.product_name NOT IN (SELECT name FROM products)
      GROUP BY s.product_name
    )
    SELECT * FROM (
      SELECT id, displayName as name, source, purchasePrice, lastSalePrice, salesCount, lastSoldAt, base_unit, has_packages, package_name, units_per_package, is_continuous, stock, article, color, baseName FROM CatalogMatches
      UNION ALL
      SELECT id, displayName as name, source, purchasePrice, lastSalePrice, salesCount, lastSoldAt, base_unit, has_packages, package_name, units_per_package, is_continuous, stock, article, color, baseName FROM HistoryMatches
    ) AS CombinedResults
    ORDER BY
      CASE WHEN source = 'catalog' THEN 0 ELSE 1 END,
      CASE WHEN source = 'catalog' THEN article ELSE NULL END NULLS LAST,
      CASE WHEN source = 'catalog' THEN baseName ELSE name END,
      color
    LIMIT 8
  `, [query, query, query]);
}

// ── Shop Session ────────────────────────────────────
export function saveShopSession(data: {
  shopId: string;
  shopName: string;
  role: 'owner' | 'seller';
  sellerName: string;
  inviteCode?: string;
}) {
  db.withTransactionSync(() => {
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        db.runSync(
          "INSERT OR REPLACE INTO shop_session (key, value) VALUES (?, ?)",
          [key, String(value)]
        );
      }
    });
  });
}

export function getShopSession(): {
  shopId: string | null;
  shopName: string | null;
  role: 'owner' | 'seller' | null;
  sellerName: string | null;
  inviteCode: string | null;
} {
  const rows = db.getAllSync("SELECT key, value FROM shop_session") as { key: string; value: string }[];
  const map: Record<string, string> = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return {
    shopId: map.shopId || null,
    shopName: map.shopName || null,
    role: (map.role as 'owner' | 'seller') || null,
    sellerName: map.sellerName || null,
    inviteCode: map.inviteCode || null,
  };
}

export function clearShopSession() {
  db.runSync("DELETE FROM shop_session");
}

// Обновлённая addSale — принимает seller_id и seller_name
export function addSaleWithSeller(
  productId: number | null,
  productName: string,
  quantity: number,
  sellPrice: number,
  buyPrice: number,
  note: string = '',
  sellerId: string,
  sellerName: string,
  role: 'owner' | 'seller',
  isPendingReview: number = 0
) {
  // Продавец не может знать прибыль — ставим null
  const profit = role === 'owner' ? (sellPrice - buyPrice) * quantity : null;
  const actualBuyPrice = role === 'owner' ? buyPrice : null;
  const stockUpdated = productId ? 1 : 0;

  let result: any;
  db.withTransactionSync(() => {
    result = db.runSync(
      `INSERT INTO sales (
        product_id, product_name, quantity, sell_price, buy_price,
        profit, note, stock_updated, created_at, seller_id, seller_name, is_pending_review
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId, productName, quantity, sellPrice, actualBuyPrice,
        profit, note, stockUpdated, nowLocalISO(), sellerId, sellerName, isPendingReview
      ]
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
}

export function addOrderWithItems(
  items: Array<{
    productId: number | null;
    productName: string;
    quantity: number;
    sellPrice: number;
    buyPrice: number;
    note?: string;
    isPendingReview?: number;
  }>,
  clientId: number | null,
  paymentType: 'full' | 'partial' | 'debt',
  paidAmount: number,
  dueDate: string,
  sellerId: string,
  sellerName: string,
  role: 'owner' | 'seller'
): { orderId: number; saleIds: number[]; totalAmount: number } {
  const totalAmount = items.reduce((sum, item) => sum + item.sellPrice * item.quantity, 0);
  const now = nowLocalISO();
  let orderId: number;
  const saleIds: number[] = [];
  const lowStockProducts: Array<{ name: string; stock: number }> = [];

  db.withTransactionSync(() => {
    // 1. Insert Order
    const orderResult = db.runSync(
      `INSERT INTO orders (client_id, seller_id, seller_name, total_amount, payment_type, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
      [clientId, sellerId, sellerName, totalAmount, paymentType, now]
    ) as { lastInsertRowId: number };
    orderId = orderResult.lastInsertRowId;

    // 2. Insert Sales and Update Stock
    for (const item of items) {
      const profit = role === 'owner' ? (item.sellPrice - item.buyPrice) * item.quantity : null;
      const actualBuyPrice = role === 'owner' ? item.buyPrice : null;
      const stockUpdated = item.productId ? 1 : 0;

      const saleResult = db.runSync(
        `INSERT INTO sales (
          product_id, product_name, quantity, sell_price, buy_price,
          profit, note, stock_updated, created_at, seller_id, seller_name, order_id, is_pending_review
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.productId, item.productName, item.quantity, item.sellPrice, actualBuyPrice,
          profit, item.note || null, stockUpdated, now, sellerId, sellerName, orderId, item.isPendingReview || 0
        ]
      ) as { lastInsertRowId: number };
      saleIds.push(saleResult.lastInsertRowId);

      if (item.productId) {
        db.runSync('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.productId]);

        // Prepare for notification after transaction
        const p = db.getFirstSync('SELECT name, stock, min_stock_alert FROM products WHERE id = ?', [item.productId]) as any;
        if (p && p.stock <= p.min_stock_alert && p.min_stock_alert > 0) {
          lowStockProducts.push({ name: p.name, stock: p.stock });
        }
      }
    }

    // 3. Add Debt if applicable
    if (paymentType !== 'full' && clientId) {
      addDebt(clientId, null, totalAmount, paidAmount, '', dueDate, orderId);
    }
  });

  // 4. Notify low stock after transaction
  lowStockProducts.forEach(p => notifyLowStock(p.name, p.stock));

  return { orderId: orderId!, saleIds, totalAmount };
}

// Статистика для продавца (только его продажи, без buy_price)
export function getMyStats(sellerId: string, days: number = 1) {
  const result = db.getFirstSync(`
    SELECT
      COALESCE(SUM(sell_price * quantity), 0) as revenue,
      COALESCE(COUNT(*), 0) as count
    FROM sales
    WHERE seller_id = ? AND created_at >= ?
  `, [sellerId, daysAgoLocalISO(days)]) as any;
  return result;
}

export function getMySalesToday(sellerId: string) {
  return db.getAllSync(
    `SELECT * FROM sales WHERE seller_id = ? AND date(created_at) = ? ORDER BY created_at DESC`,
    [sellerId, todayLocalDate()]
  );
}

export function getProductSalesByDay(productId: number, days: number = 14): any[] {
  return db.getAllSync(
    `SELECT substr(created_at,1,10) as day,
            SUM(quantity) as qty,
            SUM(sell_price * quantity) as revenue
     FROM sales
     WHERE product_id = ?
       AND created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY day
     ORDER BY day ASC`,
    [productId, days]
  );
}

export function getDebtsByProductId(productId: number): any[] {
  return db.getAllSync(
    `SELECT d.*, c.name as client_name, c.phone as client_phone,
            (d.amount_total - d.amount_paid) AS remaining
     FROM debts d
     JOIN clients c ON d.client_id = c.id
     JOIN sales s ON d.sale_id = s.id
     WHERE s.product_id = ? AND d.status = 'active'
     ORDER BY d.created_at DESC`,
    [productId]
  );
}

export function getProductExpenses(productId: number): { total: number; count: number } {
  const result = db.getFirstSync(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
     FROM expenses
     WHERE linked_product_id = ?`,
    [productId]
  ) as any;
  return result || { total: 0, count: 0 };
}

export function getPendingReviewCount(): number {
  const result = db.getFirstSync(
    "SELECT COUNT(*) as count FROM sales WHERE is_pending_review = 1"
  ) as any;
  return result?.count || 0;
}

// ── Presence Check-in Helpers ────────────────────────────────────

export interface LocalCheckIn {
  local_date: string;
  method: 'gps' | 'nfc' | 'qr';
  gps_lat?: number | null;
  gps_lng?: number | null;
  nfc_tag_uid?: string | null;
  qr_token?: string | null;
  created_at: string;
  synced: number;
  server_status: 'pending' | 'partial' | 'confirmed' | 'rejected';
  server_error?: string | null;
}

export function insertPendingCheckIn(data: LocalCheckIn) {
  return db.runSync(
    `INSERT OR REPLACE INTO shift_checkins (
      local_date, method, gps_lat, gps_lng, nfc_tag_uid, qr_token, created_at, synced, server_status, server_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.local_date,
      data.method,
      data.gps_lat ?? null,
      data.gps_lng ?? null,
      data.nfc_tag_uid ?? null,
      data.qr_token ?? null,
      data.created_at,
      data.synced,
      data.server_status,
      data.server_error ?? null,
    ]
  );
}

export function getTodayCheckInLocal(): LocalCheckIn | null {
  const today = todayLocalDate();
  return db.getFirstSync('SELECT * FROM shift_checkins WHERE local_date = ?', [today]) as LocalCheckIn | null;
}

export function updateCheckInSyncResult(status: string, error: string | null, synced: number = 1) {
  const today = todayLocalDate();
  return db.runSync(
    'UPDATE shift_checkins SET server_status = ?, server_error = ?, synced = ? WHERE local_date = ?',
    [status, error, synced, today]
  );
}

export function getUnsyncedCheckIn(): LocalCheckIn | null {
  return db.getFirstSync('SELECT * FROM shift_checkins WHERE synced = 0') as LocalCheckIn | null;
}

export { nowLocalISO, todayLocalDate };

export { db };
export default db;