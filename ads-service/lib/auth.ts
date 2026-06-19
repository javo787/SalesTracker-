import { headers } from 'next/headers';

import crypto from 'crypto';

export function checkAuth() {
  const headerList = headers();
  const password = headerList.get('x-admin-password');
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!password || !adminPassword) return false;

  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(password),
      Buffer.from(adminPassword)
    );
  } catch (e) {
    // Fails if buffers have different lengths
    return false;
  }
}
