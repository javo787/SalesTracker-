export interface InvoiceScanItem {
  product_name: string;
  variant: string | null;
  quantity: number;
  unit_price: number;
  line_total: number | null;
  line_total_mismatch: boolean;
  category_guess: string | null;
  needs_confirmation: boolean;
  // Заполняются на клиенте после matchProductByName()/voice-disambiguate,
  // как и в VoiceSaleItem - бэкенд про каталог магазина ничего не знает.
  matchedProductId?: number | null;
  matchConfidence?: 'exact' | 'fuzzy_confident' | 'ambiguous' | 'none' | 'ai_matched';
  // Клиентское поле (этап 4) - в накладной цены продажи нет, только закупочная.
  // Обязательно для новых товаров (matchedProductId === null), не используется
  // для уже существующих (их sell_price не трогаем при приёмке).
  sell_price: number | null;
}

export interface InvoiceScanResult {
  items: InvoiceScanItem[];
  grand_total: number | null;
  supplier_hint: string | null;
  language_detected: 'ru' | 'tg' | 'uz' | 'mixed' | 'unknown';
  truncated: boolean;
  computed_total: number;
  grand_total_mismatch: boolean;
  source: 'gemini_vision' | 'groq_vision' | 'scan_failed';
}

// Этап 4 - вход/выход database.ts:applyInvoiceScan()
export interface InvoiceScanApplyItem {
  matchedProductId: number | null;
  product_name: string;
  variant: string | null;
  category_guess: string | null;
  quantity: number;
  unit_price: number;
  sell_price: number | null;
}

export interface InvoiceScanApplyResult {
  newProductIds: number[];
  updatedProductIds: number[];
  movementCount: number;
}
