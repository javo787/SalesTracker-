import { cyrillicToLatin } from './transliteration';

/** Нижний регистр, без пунктуации, схлопнутые пробелы. */
function basicNormalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,!?;:()«»"'/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Разбивает строку на слова-токены после базовой нормализации. */
export function tokenize(input: string): string[] {
  const normalized = basicNormalize(input);
  return normalized.length ? normalized.split(' ') : [];
}

/**
 * Jaro-Winkler схожесть строк, 0..1 (1 = идентичны).
 * Стандартный алгоритм (Winkler, 1990, US Census Bureau) — в отличие от
 * Левенштейна лучше держит короткие именные строки, перестановки соседних
 * букв и опечатки/варианты написания ближе к началу слова, что как раз
 * характерно для транслитерационных вариантов ("Даниел"/"Даниэл"/"Deniel").
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  transpositions = Math.floor(transpositions / 2);

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3;

  // Winkler-бонус за общий префикс (до 4 символов) — совпадающее начало
  // слова сильнее говорит о том же имени, чем совпадение в середине/конце.
  let prefixLen = 0;
  const maxPrefix = Math.min(4, len1, len2);
  while (prefixLen < maxPrefix && s1[prefixLen] === s2[prefixLen]) prefixLen++;

  return jaro + prefixLen * 0.1 * (1 - jaro);
}

/**
 * Схожесть двух строк с учётом кросс-скриптовых вариантов (кириллица/латиница).
 * Считает Jaro-Winkler в четырёх комбинациях (оригинал/транслит на обеих
 * сторонах) и берёт лучший результат — так "Даниел" и "Daniel" сравниваются
 * в общем латинском пространстве, а не побуквенно в разных алфавитах.
 */
export function crossScriptSimilarity(a: string, b: string): number {
  const aNorm = basicNormalize(a);
  const bNorm = basicNormalize(b);
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;

  const aLat = cyrillicToLatin(aNorm);
  const bLat = cyrillicToLatin(bNorm);

  return Math.max(
    jaroWinkler(aNorm, bNorm),
    jaroWinkler(aLat, bNorm),
    jaroWinkler(aNorm, bLat),
    jaroWinkler(aLat, bLat)
  );
}

/**
 * Схожесть запроса с многословным названием товара.
 *
 * Сравнивает запрос не только со всей строкой названия, но и с каждым
 * словом-токеном отдельно, беря лучший результат. Это чинит основной
 * репортнутый кейс: "Daniel" при названии "рубашка Daniel" раньше терялся,
 * потому что схожесть считалась по ВСЕЙ строке ("daniel" vs "рубашка daniel"),
 * и восьмисимвольный префикс "рубашка " размывал оценку ниже порога.
 * Посравнению по токенам "daniel" сравнивается напрямую с "daniel" — 1.0.
 *
 * Для очень коротких токенов (1-2 символа) Jaro-Winkler малоинформативен,
 * поэтому используется простая проверка на префикс (с учётом транслита).
 */
export function tokenAwareSimilarity(query: string, target: string): number {
  const wholeStringScore = crossScriptSimilarity(query, target);

  const queryTokens = tokenize(query);
  const targetTokens = tokenize(target);
  if (queryTokens.length === 0 || targetTokens.length === 0) return wholeStringScore;

  let bestTokenScore = 0;
  for (const qt of queryTokens) {
    for (const tt of targetTokens) {
      let score: number;
      if (qt.length <= 2) {
        const qtLat = cyrillicToLatin(qt);
        const ttLat = cyrillicToLatin(tt);
        score = tt.startsWith(qt) || ttLat.startsWith(qtLat) ? 0.9 : 0;
      } else {
        score = crossScriptSimilarity(qt, tt);
      }
      if (score > bestTokenScore) bestTokenScore = score;
    }
  }

  return Math.max(wholeStringScore, bestTokenScore);
}
