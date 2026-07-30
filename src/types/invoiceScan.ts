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
}

export interface InvoiceScanResult {
  items: InvoiceScanItem[];
  grand_total: number | null;
  supplier_hint: string | null;
  language_detected: 'ru' | 'tg' | 'uz' | 'mixed' | 'unknown';
  truncated: boolean;
  computed_total: number;
  grand_total_mismatch: boolean;
  source: 'gemini_vision' | 'scan_failed';
}
