import { AutocompleteResult } from '../types/product';

/**
 * Расстояние Левенштейна между двумя строками.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Нормализованная схожесть строк, 0..1 (1 = идентичны).
 */
export function similarity(a: string, b: string): number {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();
  if (normA === normB) return 1;
  const maxLen = Math.max(normA.length, normB.length) || 1;
  return 1 - levenshtein(normA, normB) / maxLen;
}

export type MatchConfidence = 'exact' | 'fuzzy_confident' | 'ambiguous' | 'none' | 'ai_matched';

export interface ProductMatchResult {
  confidence: MatchConfidence;
  /** Единственное уверенное совпадение (exact или fuzzy_confident) */
  match: AutocompleteResult | null;
  /** Список кандидатов при ambiguous (2-8 штук), пусто в остальных случаях */
  candidates: AutocompleteResult[];
}

const CONFIDENT_THRESHOLD = 0.8;
const POSSIBLE_THRESHOLD = 0.5;

/**
 * Сопоставляет распознанное голосом название товара с локальным каталогом.
 * Каталог передаётся целиком (магазины небольшие, JS справляется без проблем).
 */
export function matchProductByName(
  recognizedName: string,
  products: AutocompleteResult[]
): ProductMatchResult {
  if (!recognizedName?.trim() || products.length === 0) {
    return { confidence: 'none', match: null, candidates: [] };
  }

  const normalizedQuery = recognizedName.toLowerCase().trim();

  // 1. Точное совпадение по нормализованному имени
  const exact = products.find(p => p.name.toLowerCase().trim() === normalizedQuery);
  if (exact) {
    return { confidence: 'exact', match: exact, candidates: [] };
  }

  // 2. Fuzzy по всему каталогу
  const scored = products
    .map(p => ({ product: p, score: similarity(normalizedQuery, p.name) }))
    .filter(s => s.score >= POSSIBLE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { confidence: 'none', match: null, candidates: [] };
  }

  // 3. closeMatches — всё, что близко к лучшему результату (окно 0.05).
  const topScore = scored[0].score;
  const closeMatches = scored.filter(s => s.score >= topScore - 0.05).map(s => s.product);

  // Ровно одно уверенное совпадение — автолинк без вопросов.
  if (topScore >= CONFIDENT_THRESHOLD && closeMatches.length === 1) {
    return { confidence: 'fuzzy_confident', match: closeMatches[0], candidates: [] };
  }

  // 2+ похожих кандидата — неоднозначность. Если они делят один article
  // (варианты одного товара по цвету/размеру), это даже лучший случай для UI:
  // кандидаты явно относятся к одному товару, порядок сортировки не важен.
  if (closeMatches.length > 1) {
    return { confidence: 'ambiguous', match: null, candidates: closeMatches.slice(0, 8) };
  }

  // Единственный кандидат, но score ниже порога уверенности — тоже требует подтверждения.
  if (topScore >= POSSIBLE_THRESHOLD) {
    return { confidence: 'ambiguous', match: null, candidates: scored.slice(0, 8).map(s => s.product) };
  }

  return { confidence: 'none', match: null, candidates: [] };
}
