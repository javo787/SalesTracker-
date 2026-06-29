/**
 * Converts a date string from DD.MM.YYYY format to ISO YYYY-MM-DD format.
 * @param ddmmyyyy Date string in DD.MM.YYYY format
 * @returns Date string in YYYY-MM-DD format or null if invalid
 */
export function toISODate(ddmmyyyy: string): string | null {
  if (!ddmmyyyy || ddmmyyyy.length !== 10) return null;
  const parts = ddmmyyyy.split('.');
  if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return null;
}
