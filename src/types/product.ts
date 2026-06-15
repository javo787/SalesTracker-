export interface AutocompleteResult {
  id: string | null;
  name: string;
  source: 'catalog' | 'history';
  purchasePrice: number;        // цена закупки — заполняется всегда
  lastSalePrice: number | null; // последняя цена продажи — может быть null
  salesCount: number;           // сколько раз продавался (для сортировки)
  lastSoldAt: string | null;
}
