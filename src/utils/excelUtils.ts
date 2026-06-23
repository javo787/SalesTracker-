import { Buffer } from 'buffer';

/**
 * Converts an ArrayBuffer to a Base64 string using the polyfilled Buffer.
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  return Buffer.from(buffer).toString('base64');
};
