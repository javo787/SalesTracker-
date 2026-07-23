export const ALLOWED_PERMISSIONS = ['manage_debtors', 'manage_team', 'manage_products'] as const;
export type Permission = typeof ALLOWED_PERMISSIONS[number];

export function isValidPermission(p: string): p is Permission {
  return (ALLOWED_PERMISSIONS as readonly string[]).includes(p);
}
