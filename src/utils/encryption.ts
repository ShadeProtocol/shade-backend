import crypto from 'node:crypto';
import { environment } from '../config/environment.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export function getEncryptionKey(): Buffer {
  const keyHex =
    process.env.DEPOSIT_ACCOUNT_ENCRYPTION_KEY || environment.depositAccountEncryptionKey;
  if (
    !keyHex ||
    typeof keyHex !== 'string' ||
    keyHex.length !== 64 ||
    !/^[0-9a-fA-F]{64}$/.test(keyHex)
  ) {
    throw new Error('DEPOSIT_ACCOUNT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(keyHex, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
