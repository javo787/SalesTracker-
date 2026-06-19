import { headers } from 'next/headers';

export function checkAuth() {
  const headerList = headers();
  const password = headerList.get('x-admin-password');

  if (password !== process.env.ADMIN_PASSWORD) {
    return false;
  }
  return true;
}
