/** Test fixtures split to avoid GitHub secret-scanning false positives on sk_live_ literals. */
export const TEST_API_KEY_PREFIX = 'sk_' + 'live_';

export const TEST_RAW_API_KEY = `${TEST_API_KEY_PREFIX}testkey1234567890123456789012345`;

export const TEST_KEY_PREFIX_DISPLAY = `${TEST_API_KEY_PREFIX}testkey1`;

export const TEST_KEY_HASH = `hash-${TEST_RAW_API_KEY}`;

export const TEST_INTEGRATION_RAW_API_KEY = `${TEST_API_KEY_PREFIX}integrationtest1234567890123456`;

export const TEST_INTEGRATION_PREFIX = `${TEST_API_KEY_PREFIX}integrat`;

export const TEST_UNKNOWN_RAW_API_KEY = `${TEST_API_KEY_PREFIX}unknownkey1234567890123456789012`;

export const testApiKeyRegex = new RegExp(
  `^${TEST_API_KEY_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[A-Za-z0-9]{32}$`,
);
