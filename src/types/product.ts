export interface Product {
  id: number;
  name: string;
  buy_price: number;
  sell_price: number;
  stock: number;
  min_stock_alert: number;
  base_unit: string;
  has_packages: number;
  package_name: string | null;
  units_per_package: number;
  category: string | null;
  updated_at: string | null;
  synced: number;
  is_deleted: number;
  created_at: string;
}

export interface StockMovement {
  id: string;
  product_id: number;
  type: 'stock_in' | 'correction' | 'waste';
  quantity_change: number;
  price_per_unit: number | null;
  note: string | null;
  created_at: string;
  synced: number;
}

export interface AutocompleteResult {
  id: string | null;
  name: string;
  source: 'catalog' | 'history';
  purchasePrice: number;        // цена закупки — заполняется всегда
  lastSalePrice: number | null; // последняя цена продажи — может быть null
  salesCount: number;           // сколько раз продавался (для сортировки)
  lastSoldAt: string | null;
  base_unit?: string;
  has_packages?: number;
  package_name?: string | null;
  units_per_package?: number;
  is_continuous?: number;
  stock?: number;
}
