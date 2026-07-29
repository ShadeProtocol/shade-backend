import crypto from 'node:crypto';
import { encrypt, decrypt, getEncryptionKey } from '../../src/utils/encryption.js';

describe('Encryption Utility', () => {
  const validKeyHex = crypto.randomBytes(32).toString('hex');
  const originalEnvKey = process.env.DEPOSIT_ACCOUNT_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.DEPOSIT_ACCOUNT_ENCRYPTION_KEY = validKeyHex;
  });

  afterAll(() => {
    if (originalEnvKey !== undefined) {
      process.env.DEPOSIT_ACCOUNT_ENCRYPTION_KEY = originalEnvKey;
    } else {
      delete process.env.DEPOSIT_ACCOUNT_ENCRYPTION_KEY;
    }
  });

  describe('getEncryptionKey', () => {
    it('returns a 32-byte Buffer for a valid 64-char hex key', () => {
      const keyBuffer = getEncryptionKey();
      expect(keyBuffer).toBeInstanceOf(Buffer);
      expect(keyBuffer.length).toBe(32);
    });

    it('throws an error if key is missing', () => {
      delete process.env.DEPOSIT_ACCOUNT_ENCRYPTION_KEY;
      expect(() => getEncryptionKey()).toThrow(
        'DEPOSIT_ACCOUNT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'
      );
    });

    it('throws an error if key is less than 64 hex characters', () => {
      process.env.DEPOSIT_ACCOUNT_ENCRYPTION_KEY = '1234567890abcdef';
      expect(() => getEncryptionKey()).toThrow(
        'DEPOSIT_ACCOUNT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'
      );
    });

    it('throws an error if key contains non-hex characters', () => {
      process.env.DEPOSIT_ACCOUNT_ENCRYPTION_KEY = 'Z'.repeat(64);
      expect(() => getEncryptionKey()).toThrow(
        'DEPOSIT_ACCOUNT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'
      );
    });
  });

  describe('encrypt and decrypt', () => {
    it('correctly encrypts and decrypts a string round-trip', () => {
      const secret = 'SDORW56POGIXY3NZS24EPRP36Y4QUTYJ2E2MVRKVKZ27TXL5N7227W4G';
      const ciphertext = encrypt(secret);

      expect(typeof ciphertext).toBe('string');
      expect(ciphertext.split(':').length).toBe(3);

      const decrypted = decrypt(ciphertext);
      expect(decrypted).toBe(secret);
    });

    it('throws an error when decrypting malformed ciphertext', () => {
      expect(() => decrypt('invalid-ciphertext-format')).toThrow('Invalid ciphertext format');
    });

    it('throws an error when ciphertext tag or data is corrupted', () => {
      const secret = 'test-secret';
      const ciphertext = encrypt(secret);
      const [iv, tag, data] = ciphertext.split(':');
      const corruptedData = data.substring(0, data.length - 2) + (data.endsWith('00') ? 'ff' : '00');
      const corruptedCiphertext = `${iv}:${tag}:${corruptedData}`;

      expect(() => decrypt(corruptedCiphertext)).toThrow();
    });
  });
});
