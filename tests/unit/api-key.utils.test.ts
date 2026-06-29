import {
  generateApiKeyMaterial,
  hashApiKey,
  isApiKeyToken,
  API_KEY_RANDOM_LENGTH,
  API_KEY_PREFIX,
} from '../../src/utils/api-key.utils.js';
import { TEST_API_KEY_PREFIX, testApiKeyRegex } from '../helpers/api-key.fixtures.js';

describe('api-key.utils', () => {
  test('generateApiKeyMaterial creates live-prefixed keys with prefix and hash', () => {
    const material = generateApiKeyMaterial();

    expect(material.rawKey).toMatch(testApiKeyRegex);
    expect(material.rawKey.length).toBe(API_KEY_PREFIX.length + API_KEY_RANDOM_LENGTH);
    expect(material.prefix).toBe(material.rawKey.slice(0, API_KEY_PREFIX.length + 8));
    expect(material.keyHash).toBe(hashApiKey(material.rawKey));
    expect(material.keyHash).toHaveLength(64);
  });

  test('generateApiKeyMaterial produces unique keys across multiple calls', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKeyMaterial().rawKey));
    expect(keys.size).toBe(50);
  });

  test('hashApiKey is deterministic and hex-encoded', () => {
    const sampleKey = `${TEST_API_KEY_PREFIX}abc123`;
    const hash1 = hashApiKey(sampleKey);
    const hash2 = hashApiKey(sampleKey);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash1).not.toBe(hashApiKey(`${TEST_API_KEY_PREFIX}abc124`));
  });

  test('isApiKeyToken identifies API key bearer tokens', () => {
    expect(isApiKeyToken(`${TEST_API_KEY_PREFIX}abc123`)).toBe(true);
    expect(isApiKeyToken('valid-session-token')).toBe(false);
    expect(isApiKeyToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe(false);
  });
});
