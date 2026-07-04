# ROADMAP_WAREHOUSE.md — Складской учёт для Torgo

## 1. Цель и принципы

Добавить полноценный складской модуль: учёт остатков, приёмка товара, списание брака, инвентаризация-сверка, средневзвешенная себестоимость, поддержка опт/розница (упаковки), голосовой ввод складских операций, история движений и совместимость с будущей синхронизацией через MongoDB.

Принципы:
- **Для пользователя** — максимально просто: 2-3 тапа на операцию, голосовой ввод, понятная история.
- **Внутри** — точные расчёты (средневзвешенная цена), полный аудит-лог, готовность к мультиустройственной синхронизации.
- **Без поломки существующего** — все изменения через `ALTER TABLE` (как уже сделано с `min_stock_alert`), без миграции существующих данных пользователей, без переписывания работающего sync.

---

## 2. Изменения в схеме данных (SQLite)

### 2.1 Расширение таблицы `products`

```sql
ALTER TABLE products ADD COLUMN base_unit TEXT DEFAULT 'шт';
ALTER TABLE products ADD COLUMN has_packages INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN package_name TEXT;
ALTER TABLE products ADD COLUMN units_per_package REAL DEFAULT 1;
ALTER TABLE products ADD COLUMN updated_at TEXT;
ALTER TABLE products ADD COLUMN synced INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN is_deleted INTEGER DEFAULT 0;
```

Все добавления — через миграционный блок в `initDatabase()`, по аналогии с существующей проверкой `min_stock_alert` / `stock_updated`: `PRAGMA table_info(products)`, если колонки нет — `ALTER TABLE`.

`buy_price` остаётся как есть и становится средневзвешенной ценой — никаких переименований полей, чтобы не трогать `ProductsScreen`, `AddSaleScreen`, AI-промпты и backend `Product.ts`.

**Назначение `updated_at`:** не заготовка под будущий incremental sync (текущий `pull()` полный и для объёмов одного торговца это нормально), а практическое поле — показывать пользователю "когда последний раз менялся остаток" при сверке. Проставляется в каждой функции, изменяющей `stock` (`addStockIn`, `addStockWaste`, `addStockCorrection`, и желательно — в существующих `updateStock`/`updateStockManual`).

### 2.2 Новая таблица `stock_movements`

```sql
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,              -- UUID (expo-crypto)
  product_id INTEGER NOT NULL,
  type TEXT NOT NULL,               -- 'stock_in' | 'correction' | 'waste'
  quantity_change REAL NOT NULL,    -- в базовых единицах, +/-
  price_per_unit REAL,              -- для stock_in: цена за базовую единицу
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  synced INTEGER DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

### 2.3 Backend: новая модель `StockMovement.ts`

```typescript
// backend/models/StockMovement.ts
const StockMovementSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  localId: { type: String, required: true },   // UUID с клиента
  product_id: { type: Number, required: true }, // localId товара
  type: { type: String, required: true },
  quantity_change: { type: Number, required: true },
  price_per_unit: { type: Number },
  note: { type: String },
  created_at: { type: String },
});
StockMovementSchema.index({ userId: 1, localId: 1 }, { unique: true });
```

Расширить `backend/models/Product.ts` полями: `base_unit`, `has_packages`, `package_name`, `units_per_package`, `updated_at` (опционально, с `default` значениями).

Расширить `backend/routes/sync.ts`: добавить обработку `stockMovements` в `push`/`pull` по той же схеме upsert через `{userId, localId}`, что уже есть для `products`/`sales`.

---

## 3. Математическое ядро (database.ts)

### 3.1 Конвертация упаковок → базовые единицы

Если операция указана в упаковках:
```
quantityBase = quantityPackages * units_per_package
pricePerUnitBase = totalPackagePrice / units_per_package
```
Если в базовых единицах — без конвертации.

Пример: «2 коробки колы по 120 сомони» → `quantity = 2`, `pricePerUnit = 120` (это цена **за коробку**, не за штуку). Конвертация: `quantityBase = 2 * 24 = 48`, `pricePerUnitBase = 120 / 24 = 5`.

### 3.2 Средневзвешенная цена при приёмке

```typescript
function calcWeightedPrice(oldStock: number, oldPrice: number, incomingQty: number, incomingPrice: number): number {
  const safeOldStock = Math.max(oldStock, 0); // защита от отрицательного остатка
  const newStock = safeOldStock + incomingQty;
  if (newStock === 0) return oldPrice;
  return (safeOldStock * oldPrice + incomingQty * incomingPrice) / newStock;
}
```

Защита `Math.max(oldStock, 0)` гарантирует корректный пересчёт даже если перед приёмкой остаток был отрицательным (например, после ошибочного списания — см. п.3.3).

### 3.3 Новые функции в `src/db/database.ts`

```typescript
// Приёмка товара
export function addStockIn(
  productId: number,
  quantity: number,        // в единицах, указанных unitType
  pricePerUnit: number,    // цена за единицу, указанную unitType
  unitType: 'base' | 'package',
  note: string = ''
): void

// Списание брака/порчи
export function addStockWaste(
  productId: number,
  quantity: number,
  note: string = ''
): void

// Инвентаризация (сверка с фактом)
export function addStockCorrection(
  productId: number,
  actualStock: number,
  note: string = ''
): void

// История движений товара (последние N)
export function getStockMovements(productId: number, limit: number = 20): StockMovement[]
```

**Логика `addStockIn`:**
1. Получить товар (`stock`, `buy_price`, `units_per_package`).
2. Если `unitType === 'package'` — конвертировать `quantity` и `pricePerUnit` в базовые единицы (см. 3.1).
3. Посчитать `newBuyPrice` через `calcWeightedPrice`.
4. `UPDATE products SET stock = stock + ?, buy_price = ?, updated_at = ?, synced = 0`.
5. `INSERT INTO stock_movements (id, product_id, type='stock_in', quantity_change, price_per_unit, note, created_at)`.
6. Если новый `stock` всё ещё `<= min_stock_alert` — ничего (товар пришёл, алерт снимется автоматически при следующей проверке).

**Логика `addStockWaste`:**
1. `UPDATE products SET stock = stock - ?, updated_at = ?, synced = 0`.
2. `INSERT INTO stock_movements (type='waste', quantity_change = -quantity, ...)`.
3. Проверить `min_stock_alert` → `notifyLowStock` при необходимости (переиспользовать существующую функцию).

**Защита от отрицательного остатка:** проверка `quantity > currentStock` выполняется в UI (`StockOperationModal`) перед вызовом `addStockWaste`. При превышении — `Alert.alert` с подтверждением: *«Списываете больше, чем есть на складе (осталось X). Продолжить?»*. Сама DB-функция не блокирует операцию — отрицательный остаток допустим как диагностический сигнал (расхождение учёта с фактом, требующее внимания торговца), а не как ошибка, которую нужно маскировать автокоррекцией.

**Логика `addStockCorrection`:**
1. `delta = actualStock - currentStock`.
2. `UPDATE products SET stock = actualStock, updated_at = ?, synced = 0`.
3. `INSERT INTO stock_movements (type='correction', quantity_change = delta, ...)`.

`getStockMovements`: вернуть последние N записей из `stock_movements` для товара. Объединение с продажами из `sales` делается на уровне JS в компоненте (см. п.5.3), не в SQL.

---

## 4. UI/UX

### 4.1 `StockOperationModal` (новый компонент)

Расположение: `src/components/stock/StockOperationModal.tsx`. Паттерн — копия структуры `AddExpenseModal` (модалка снизу, `VoiceRecorder`, форма, кнопка сохранить).

Три вкладки (как `typeSwitcher` в `AddExpenseModal`):

**Приёмка (`stock_in`)**
- Поле "Количество"
- Переключатель "Штуки / {package_name}" — виден только если `product.has_packages === 1`
- Поле цены с **динамической подписью**:
  - если выбрано "Штуки" → лейбл "Цена за {base_unit}" (например "Цена за шт")
  - если выбрано "{package_name}" → лейбл "Цена за {package_name}" (например "Цена за коробку")
- Заметка (опционально)

**Списание (`waste`)**
- Поле "Количество"
- Причина (заметка) — например "испортилось", "украли", "брак"
- Перед сохранением: если `quantity > currentStock` → `Alert` с подтверждением (см. 3.3)

**Сверка (`correction`)**
- Текущий остаток показывается как подсказка/placeholder
- Поле "Фактический остаток"
- Заметка (опционально)

Голосовой ввод: тот же `VoiceRecorder`, передаётся в Gemini с расширенным промптом (см. п.6). По результату AI определяется `operation_type`, открывается соответствующая вкладка с предзаполненными полями.

### 4.2 Интеграция в `ProductsScreen`

На карточке товара (`productItem`) добавить ряд из 3 кнопок-иконок: 📥 Приёмка, 📤 Списание, 🔍 Сверка. По нажатию — открывается `StockOperationModal` с предвыбранной вкладкой и `productId`.

По тапу на саму карточку (не на кнопки) — открывается `StockHistorySheet` (история движений).

### 4.3 `StockHistorySheet` (новый компонент)

Модалка/bottom-sheet со списком последних движений товара. Источники:
- `getStockMovements(productId)` — приходы, списания, корректировки.
- последние продажи товара из `sales` (фильтр по `product_id`).

Смерджить в JS по `created_at`, отсортировать по убыванию, показать единым списком с иконками: 📥 приход (+), 🛒 продажа (−), 🗑 списание (−), ⚖️ сверка (±).

Дополнительно: показать `updated_at` товара как "Последнее обновление: ..." в заголовке шита — полезно при сверке остатков.

### 4.4 Настройка упаковок в форме товара

В `ProductsScreen` форму добавления/редактирования товара дополнить (опционально, сворачиваемый блок "Дополнительно"):
- переключатель `has_packages`
- поле `package_name` (например "коробка")
- поле `units_per_package` (число)
- выбор `base_unit` (шт/кг/л — селектор)

Если `has_packages = 0`, блок скрыт по умолчанию, не мешает простому добавлению товара.

---

## 5. Голосовой ввод (Gemini)

### 5.1 Расширение промпта

В `analyzeWithAI`-подобной функции для `StockOperationModal` промпт возвращает:

```json
{
  "operation_type": "stock_in" | "waste" | "correction" | "unknown",
  "product_name": "string",
  "unit_type": "base" | "package",
  "quantity": number,
  "price_per_unit": number,
  "note": "string"
}
```

Примеры для few-shot:
- "пришло две коробки колы по сто двадцать сомони" → `{operation_type: "stock_in", product_name: "Кола", unit_type: "package", quantity: 2, price_per_unit: 120, note: ""}`
- "испортилось 3 кг помидор" → `{operation_type: "waste", product_name: "помидоры", unit_type: "base", quantity: 3, note: "испортилось"}`
- "по факту осталось 20 пачек чая" → `{operation_type: "correction", product_name: "чай", unit_type: "base", quantity: 20}`

### 5.2 Обработка результата

`StockOperationModal` получает JSON, находит товар по `product_name` (через существующий `searchProductsForAutocomplete`), переключает вкладку на `operation_type`, заполняет поля, ждёт подтверждения пользователя (не сохраняет автоматически — паттерн как в `AddSaleScreen`).

---

## 6. Синхронизация с MongoDB

### 6.1 Принцип

Расширяем существующий push/pull (`backend/routes/sync.ts`), не переписываем. Добавляем третий тип сущности — `stockMovements`, плюс новые поля `products` синкаются как часть существующего `Product` upsert (просто больше полей в объекте).

### 6.2 Изменения в `sync.ts`

```typescript
router.post('/push', authMiddleware, async (req, res) => {
  const { sales, products, stockMovements } = req.body;
  // ...существующая логика для products, sales...

  if (stockMovements && Array.isArray(stockMovements)) {
    const ops = stockMovements.map(m => ({
      updateOne: {
        filter: { userId, localId: m.id },
        update: { ...m, userId, localId: m.id },
        upsert: true,
      },
    }));
    if (ops.length > 0) await StockMovement.bulkWrite(ops);
  }
  // ...
});

router.get('/pull', authMiddleware, async (req, res) => {
  const products = await Product.find({ userId });
  const sales = await Sale.find({ userId });
  const stockMovements = await StockMovement.find({ userId });
  res.json({ products, sales, stockMovements });
});
```

### 6.3 Изменения в `SyncService.ts`

`push()` — добавить выгрузку `stock_movements WHERE synced = 0`, после успеха — `UPDATE ... SET synced = 1`.

`pull()` — добавить вставку новых `stockMovements` по аналогии с `sales`/`products`.

**Идемпотентность pull для stock_movements:** перед вставкой проверяется существование записи по `id`:

```typescript
// SyncService.ts, pull() для stockMovements
for (const m of data.stockMovements) {
  const existing = db.getFirstSync('SELECT id FROM stock_movements WHERE id = ?', [m.localId]);
  if (!existing) {
    db.runSync(
      'INSERT INTO stock_movements (id, product_id, type, quantity_change, price_per_unit, note, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [m.localId, m.product_id, m.type, m.quantity_change, m.price_per_unit, m.note, m.created_at]
    );
  }
}
```

Поскольку `stock_movements.id` — `TEXT PRIMARY KEY` (UUID, генерируется на клиенте через `expo-crypto`), проверка по `id` достаточна и совпадает с тем, что уже неявно происходит в `pull()` для `sales`/`products`.

### 6.4 Мягкое удаление

Поле `is_deleted` на `products` уже добавлено в схему (п.2.1). Реализация удаления товара: вместо `DELETE`, ставим `is_deleted = 1, synced = 0`, скрываем из `getProducts()` (добавить `WHERE is_deleted = 0`). При синке сервер помечает документ как удалённый/архивный. Это отдельная небольшая правка `deleteProduct` — не блокирует остальной роадмап, можно сделать в любой момент.

---

## 7. Этапы реализации

### Этап 1 — Ядро склада (без упаковок и синка)
- [ ] Миграция `database.ts`: новые колонки `products`, таблица `stock_movements`
- [ ] Функции `addStockIn`, `addStockWaste`, `addStockCorrection`, `getStockMovements` (без конвертации упаковок — `unitType` всегда `'base'`)
- [ ] `StockOperationModal` (3 вкладки, без переключателя упаковок, без голоса)
- [ ] Защита от отрицательного остатка в UI (`Alert` перед `addStockWaste`)
- [ ] Интеграция кнопок в `ProductsScreen`
- [ ] `StockHistorySheet` (история движений + продажи, отображение `updated_at`)

**Результат:** рабочий склад с точным учётом средневзвешенной цены, аудит-логом, без новых зависимостей. Можно релизить отдельно.

### Этап 2 — Опт/розница (упаковки)
- [ ] Поля `has_packages`, `package_name`, `units_per_package` в форме товара
- [ ] Конвертация в `addStockIn` (`unitType: 'package'`)
- [ ] Переключатель "шт/упаковка" в `StockOperationModal` с динамической подписью цены

### Этап 3 — Голосовой ввод складских операций
- [ ] Расширение Gemini-промпта (`operation_type`, `unit_type`)
- [ ] `VoiceRecorder` в `StockOperationModal`
- [ ] Автопереключение вкладки и автозаполнение по результату AI

### Этап 4 — Синхронизация MongoDB
- [ ] `backend/models/StockMovement.ts`
- [ ] Расширение `Product.ts` новыми полями (включая `updated_at`)
- [ ] `sync.ts`: push/pull для `stockMovements`
- [ ] `SyncService.ts`: выгрузка/загрузка движений, проверка идемпотентности по `id`
- [ ] Мягкое удаление товаров (`is_deleted`)

### Этап 5 — AI-аналитика (опционально, после релиза)
- [ ] Прогноз "День Ноль" на основе `stock_movements` + `sales`
- [ ] Оценка упущенной прибыли при `stock = 0`
- [ ] Включение в существующий `smartTips.ts`
- [ ] Простая аналитика: оборачиваемость товаров, топ-3 товара по прибыли

---

## 8. Что не делаем (и почему)

- **FIFO-партии** — избыточно для целевой аудитории, требует рефактора `purchasePricePerUnit` во всех продажах и отдельной таблицы партий. Средневзвешенная цена даёт ~95% точности при 10% сложности.
- **UUID для `products.id`** — текущая числовая `AUTOINCREMENT` схема уже синкается через `{userId, localId}`. Переход на UUID требует миграции существующих данных пользователей — отдельная задача, не часть склада.
- **SQL UNION между `stock_movements` и `sales`** — разные схемы полей, разные источники; объединение в JS безопаснее при будущих изменениях схемы.
- **Инкрементальный pull (`updated_at`-фильтр на сервере)** — `updated_at` добавляется ради UX (отображение времени последнего изменения), не как недоделанная заготовка под incremental sync. Текущий полный `pull()` достаточен для объёмов данных одного торговца. Если/когда понадобится — поле уже будет на месте и консистентно проставлено.

---

*Документ создан: 2026-06-16*
