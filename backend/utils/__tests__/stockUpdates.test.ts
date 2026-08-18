import { computeStockUpdates } from '../stockUpdates';

describe('computeStockUpdates', () => {
  it('decrements stock by the sale quantity for a single sale', () => {
    const { warningLocalIds, stockDeltaByLocalId } = computeStockUpdates(
      [{ id: 1, product_id: 100, quantity: 3 }],
      [{ localId: 100, stock: 10 }]
    );
    expect(warningLocalIds).toEqual([]);
    expect(stockDeltaByLocalId.get(100)).toBe(-3);
  });

  it('flags a warning when a single sale exceeds available stock, but still decrements in full', () => {
    const { warningLocalIds, stockDeltaByLocalId } = computeStockUpdates(
      [{ id: 1, product_id: 100, quantity: 15 }],
      [{ localId: 100, stock: 10 }]
    );
    expect(warningLocalIds).toEqual([1]);
    expect(stockDeltaByLocalId.get(100)).toBe(-15);
  });

  it('tracks cumulative depletion across repeated sales of the same product in one batch', () => {
    // stock=10; sales of 3, then 5, then 4 — the third should be flagged
    // (10-3-5=2 remaining, but needs 4). This is the behaviour the original
    // sequential findOne-per-iteration implementation had: each sufficiency
    // check saw the effect of the prior decrements within the same push.
    const { warningLocalIds, stockDeltaByLocalId } = computeStockUpdates(
      [
        { id: 1, product_id: 100, quantity: 3 },
        { id: 2, product_id: 100, quantity: 5 },
        { id: 3, product_id: 100, quantity: 4 },
      ],
      [{ localId: 100, stock: 10 }]
    );
    expect(warningLocalIds).toEqual([3]);
    expect(stockDeltaByLocalId.get(100)).toBe(-12); // 3+5+4, one consolidated op
  });

  it('does not flag sales that exactly exhaust the remaining stock', () => {
    const { warningLocalIds, stockDeltaByLocalId } = computeStockUpdates(
      [
        { id: 1, product_id: 100, quantity: 6 },
        { id: 2, product_id: 100, quantity: 4 },
      ],
      [{ localId: 100, stock: 10 }]
    );
    expect(warningLocalIds).toEqual([]);
    expect(stockDeltaByLocalId.get(100)).toBe(-10);
  });

  it('flags a warning and still records a delta when the product is not found', () => {
    // Mirrors the original: Product.findOneAndUpdate on a non-existent
    // localId simply matched zero documents rather than throwing.
    const { warningLocalIds, stockDeltaByLocalId } = computeStockUpdates(
      [{ id: 1, product_id: 999, quantity: 2 }],
      []
    );
    expect(warningLocalIds).toEqual([1]);
    expect(stockDeltaByLocalId.get(999)).toBe(-2);
  });

  it('keeps different products independent of each other', () => {
    const { warningLocalIds, stockDeltaByLocalId } = computeStockUpdates(
      [
        { id: 1, product_id: 100, quantity: 20 }, // insufficient
        { id: 2, product_id: 200, quantity: 1 }, // fine
      ],
      [
        { localId: 100, stock: 5 },
        { localId: 200, stock: 5 },
      ]
    );
    expect(warningLocalIds).toEqual([1]);
    expect(stockDeltaByLocalId.get(100)).toBe(-20);
    expect(stockDeltaByLocalId.get(200)).toBe(-1);
  });

  it('returns empty results for an empty batch', () => {
    const { warningLocalIds, stockDeltaByLocalId } = computeStockUpdates([], []);
    expect(warningLocalIds).toEqual([]);
    expect(stockDeltaByLocalId.size).toBe(0);
  });
});
