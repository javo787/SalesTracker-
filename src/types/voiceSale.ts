export interface VoiceSaleItem {
  product_name: string;
  sell_price: number;
  buy_price: number;
  quantity: number;
  needs_confirmation: boolean;
}

export interface VoiceSaleResult {
  items: VoiceSaleItem[];
  language_detected: 'ru' | 'tg' | 'uz' | 'unknown';
  truncated: boolean;
  transcript?: string;
  source: 'gemini_audio' | 'whisper_gemini' | 'whisper_groq' | 'transcript_only';
}
