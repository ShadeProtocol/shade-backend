import crypto from 'node:crypto';

export const API_KEY_PREFIX = 'sk_live_';
export const API_KEY_RANDOM_LENGTH = 32;
export const API_KEY_DISPLAY_PREFIX_LENGTH = 8;
export const MAX_ACTIVE_API_KEYS = 10;

const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const isApiKeyToken = (token: string): boolean => token.startsWith(API_KEY_PREFIX);

export const hashApiKey = (rawKey: string): string =>
  crypto.createHash('sha256').update(rawKey).digest('hex');

export const generateApiKeyMaterial = (): { rawKey: string; prefix: string; keyHash: string } => {
  const randomPart = Array.from(
    { length: API_KEY_RANDOM_LENGTH },
    () => KEY_ALPHABET[crypto.randomInt(0, KEY_ALPHABET.length)],
  ).join('');
  const rawKey = `${API_KEY_PREFIX}${randomPart}`;
  const prefix = `${API_KEY_PREFIX}${randomPart.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH)}`;
  const keyHash = hashApiKey(rawKey);

  return { rawKey, prefix, keyHash };
};
