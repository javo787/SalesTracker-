import crypto from 'crypto';

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export function verifyTelegramAuth(data: TelegramAuthData, botToken: string): boolean {
  const { hash, ...rest } = data;

  // 1. Check auth_date (not older than 24h)
  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > 86400) {
    return false;
  }

  // 2. Sort keys and create data-check-string
  const keys = Object.keys(rest).sort();
  const dataCheckString = keys
    .map(key => `${key}=${(rest as any)[key]}`)
    .join('\n');

  // 3. Create secret key
  const secretKey = crypto
    .createHash('sha256')
    .update(botToken)
    .digest();

  // 4. Calculate HMAC-SHA256
  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const isValid = hmac === hash;
  return isValid;
}
