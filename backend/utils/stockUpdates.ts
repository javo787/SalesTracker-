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
