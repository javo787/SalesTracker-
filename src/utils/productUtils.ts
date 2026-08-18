/**
 * Builds a standardized display name for a product variant.
 * Joins name, color, and size with ' · ' for whichever variant dimensions are non-empty.
 */
export function buildVariantDisplayName(
  name: string,
  color?: string | null,
  size?: string | null
): string {
  const parts = [
    name?.trim(),
    color?.trim(),
    size?.trim(),
  ].filter((p): p is string => Boolean(p && p.length > 0));

  return parts.join(' · ');
}

/** Canonical list of letter sizes in ascending order. */
const CANONICAL_LETTER_SIZES = [
  '3XS', '2XS', 'XXS',
  'XS', 'S', 'M', 'L', 'XL',
  '2XL', 'XXL', '3XL', '4XL', '5XL', '6XL'
];

/**
 * Compares two size strings in a numeric-aware and canonical letter-size aware manner.
 * - Pure numeric sizes (e.g. "38", "40", "42", "9", "10") sort numerically.
 * - Standard clothing letter sizes (XS, S, M, L, XL, etc.) sort according to canonical sequence.
 * - Mixed/other strings fall back to localeCompare.
 */
export function compareSizes(a: string | null | undefined, b: string | null | undefined): number {
  const strA = (a || '').trim();
  const strB = (b || '').trim();

  if (!strA && !strB) return 0;
  if (!strA) return 1;
  if (!strB) return -1;

  // 1. Numeric comparison if both are numbers (e.g. "9" vs "10" or "38.5" vs "39")
  const numA = parseFloat(strA);
  const numB = parseFloat(strB);
  const isNumA = !isNaN(numA) && /^\d+(\.\d+)?$/.test(strA);
  const isNumB = !isNaN(numB) && /^\d+(\.\d+)?$/.test(strB);

  if (isNumA && isNumB) {
    return numA - numB;
  }

  // 2. Canonical letter size comparison if both are in canonical list
  const normA = strA.toUpperCase();
  const normB = strB.toUpperCase();
  const idxA = CANONICAL_LETTER_SIZES.indexOf(normA);
  const idxB = CANONICAL_LETTER_SIZES.indexOf(normB);

  if (idxA !== -1 && idxB !== -1) {
    return idxA - idxB;
  }

  // 3. Fallback to localeCompare
  return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
}
