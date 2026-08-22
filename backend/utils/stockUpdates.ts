// Чистая функция без обращений к БД — вынесена отдельным модулем (а не
// просто отдельной функцией внутри routes/sync.ts), потому что sync.ts
// импортирует services/firebase, который на загрузке модуля инициализирует
// Firebase Admin — в тестовом окружении без реальных credentials это падает
// ещё до того, как дойдёт до самого теста. Здесь зависимостей нет вообще.
//
// Сохраняет семантику исходной последовательной реализации: остаток
// "списывается" в памяти по ходу перебора продаж, поэтому вторая и
// последующая продажа одного товара в одном push видят уже уменьшенный
// остаток, а не статичный снимок на момент запроса.
export function computeStockUpdates(
  qualifyingSales: Array<{ id: number; product_id: number; quantity: number }>,
  productsForStock: Array<{ localId: number; stock: number }>
): {
  warningLocalIds: number[];
  stockDeltaByLocalId: Map<number, number>;
} {
  const stockByLocalId = new Map<number, number>(
    productsForStock.map((p) => [p.localId, p.stock])
  );
  const stockDeltaByLocalId = new Map<number, number>();
  const warningLocalIds: number[] = [];

  for (const s of qualifyingSales) {
    const currentStock = stockByLocalId.get(s.product_id);
    const hasSufficientStock = currentStock !== undefined && currentStock >= s.quantity;

    if (!hasSufficientStock) {
      warningLocalIds.push(s.id);
    }

    if (currentStock !== undefined) {
      stockByLocalId.set(s.product_id, currentStock - s.quantity);
    }
    // Списываем безусловно для каждой квалифицирующейся продажи, независимо
    // от hasSufficientStock — остаток может уйти в минус, это ожидаемо.
    stockDeltaByLocalId.set(
      s.product_id,
      (stockDeltaByLocalId.get(s.product_id) || 0) - s.quantity
    );
  }

  return { warningLocalIds, stockDeltaByLocalId };
}

// Средневзвешенная себестоимость при приёмке — та же формула, что в
// src/db/database.ts:calcWeightedPrice на клиенте (продублирована, а не
// импортирована: клиентский модуль тянет react-native-зависимости,
// недоступные в backend). Если формулу меняют на клиенте — здесь тоже
// нужно поменять, иначе клиентский и серверный расчёт разъедутся.
function weightedPrice(oldStock: number, oldPrice: number, incomingQty: number, incomingPrice: number): number {
  const safeOldStock = Math.max(oldStock, 0);
  const newStock = safeOldStock + incomingQty;
  if (newStock === 0) return oldPrice;
  return (safeOldStock * oldPrice + incomingQty * incomingPrice) / newStock;
}

// Применяет stock_in-движения к остаткам, СЛЕДУЯ ПОРЯДКУ переданного массива —
// это важно именно для buy_price: средневзвешенная цена не аддитивна, вторая
// приёмка в одном батче должна взвешиваться уже от результата первой, а не
// от статичного снимка на момент запроса (тот же принцип, что в
// computeStockUpdates выше, но здесь дополнительно накапливается ещё и цена).
//
// Существует для конкретного пробела: продавец без 'manage_products' может
// делать stock_in (это разрешено UI), но целиком лишён products-канала
// синка — весь payload.products для него на клиенте пустой (см.
// syncService.ts, canManageProducts). Раньше движение уходило в
// stock_movements (журнал), а сам остаток/себестоимость — никуда: оставались
// только в локальной SQLite и терялись при первом же pull. Здесь сервер
// сам считает результат из движений, которые и так безусловно долетают.
export function computeStockInApplications(
  stockInMovements: Array<{ product_id: number; quantity_change: number; price_per_unit: number | null }>,
  currentProducts: Array<{ localId: number; stock: number; buy_price: number }>
): Map<number, { newStock: number; newBuyPrice: number }> {
  const runningByLocalId = new Map<number, { stock: number; buyPrice: number }>(
    currentProducts.map((p) => [p.localId, { stock: p.stock, buyPrice: p.buy_price }])
  );
  const touchedLocalIds = new Set<number>();

  for (const m of stockInMovements) {
    const running = runningByLocalId.get(m.product_id);
    if (!running || m.quantity_change <= 0) continue; // неизвестный товар или некорректная запись — пропускаем, не создаём фантомных строк

    // price_per_unit отсутствовать в норме не должно — StockOperationModal
    // требует его для stock_in ещё на клиенте (parseFloat + проверка >= 0).
    // Но если всё же пусто (другой клиент, будущий код) — не тянем среднюю
    // к нулю: считаем, что пришло по текущей средней цене, тогда
    // weightedPrice(oldStock, oldPrice, qty, oldPrice) === oldPrice
    // независимо от qty, средняя остаётся как была, а не занижается.
    const price = m.price_per_unit ?? running.buyPrice;
    running.buyPrice = weightedPrice(running.stock, running.buyPrice, m.quantity_change, price);
    running.stock += m.quantity_change;
    touchedLocalIds.add(m.product_id);
  }

  const result = new Map<number, { newStock: number; newBuyPrice: number }>();
  for (const localId of touchedLocalIds) {
    const running = runningByLocalId.get(localId)!;
    result.set(localId, { newStock: running.stock, newBuyPrice: running.buyPrice });
  }
  return result;
}
