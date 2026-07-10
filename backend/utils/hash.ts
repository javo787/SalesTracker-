import crypto from 'crypto';

/**
 * Hashes a raw NFC Tag UID using SHA-256 (hex digest) for secure, privacy-compliant server-side storage and validation.
 * @param tagUid Raw NFC Tag UID
 * @returns SHA-256 hashed tag UID string
 */
export function hashNfcTagUid(tagUid: string): string {
  return crypto.createHash('sha256').update(tagUid).digest('hex');
}
