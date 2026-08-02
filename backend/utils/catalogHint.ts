import Product from '../models/Product';

// Общий кусок для "каталог-осведомлённого" извлечения (изначально появился
// в voiceSale.ts, см. коммит "ground extraction in shop's product catalog").
// Список ограничен 150 названиями (сортировка по недавней активности,
// индекс {shopId, serverUpdatedAt}), чтобы не раздувать промпт для крупных
// каталогов. Никогда не бросает исключение - это подсказка, а не
// обязательная зависимость; при ошибке вызывающий пайплайн продолжает без неё.
const CATALOG_HINT_LIMIT = 150;

export async function getShopCatalogNames(shopId?: string): Promise<string[]> {
  if (!shopId) return [];
  try {
    const products = await Product.find({ shopId, is_deleted: 0 })
      .select('name')
      .sort({ serverUpdatedAt: -1 })
      .limit(CATALOG_HINT_LIMIT)
      .lean();

    return Array.from(new Set(products.map(p => p.name).filter(Boolean)));
  } catch (e) {
    console.error('[catalogHint] Failed to fetch shop catalog names', e);
    return [];
  }
}

/** Формулировка для голосового пайплайна (voiceSale.ts) - текст сохранён 1:1 с оригиналом. */
export async function buildCatalogHint(shopId?: string): Promise<string> {
  const names = await getShopCatalogNames(shopId);
  if (!names.length) return '';

  return `\n\nKnown product catalog for this shop (for reference only): ${names.join(', ')}.
If the audio clearly refers to one of these products (even with a slightly different pronunciation, accent, or partial name), use the EXACT name from this list in 'product_name'. Do not force a match to this list if you are not reasonably confident, and do not invent a product from this list that was not actually mentioned.`;
}

/**
 * Формулировка для фото-пайплайна (invoiceScan.ts) - про почерк/написание,
 * а не произношение, иначе промпт врёт про модальность.
 */
export async function buildInvoiceCatalogHint(shopId?: string): Promise<string> {
  const names = await getShopCatalogNames(shopId);
  if (!names.length) return '';

  return `\n\nKnown product catalog for this shop (for reference only): ${names.join(', ')}.
If a handwritten line clearly refers to one of these products (even with a slightly different spelling, transliteration, or abbreviation), use the EXACT name from this list in 'product_name'. Do not force a match to this list if you are not reasonably confident, and do not invent a product from this list that was not actually written on the invoice.`;
}
