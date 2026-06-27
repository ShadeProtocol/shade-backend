import { validateUpdateMerchant } from '../../src/utils/validation.js';

describe('validateUpdateMerchant', () => {
  test('accepts a valid partial payload', () => {
    expect(validateUpdateMerchant({ firstName: 'Ada' })).toEqual({});
  });

  test('rejects an empty payload (no editable fields)', () => {
    const errors = validateUpdateMerchant({});
    expect(errors._empty).toEqual(expect.any(String));
  });

  test('treats a payload of only non-editable fields as empty', () => {
    const errors = validateUpdateMerchant({ address: '0xabc', email: 'x@y.com', merchantId: 5 });
    expect(errors._empty).toEqual(expect.any(String));
  });

  test('rejects a required text field sent as empty string', () => {
    const errors = validateUpdateMerchant({ firstName: '   ' });
    expect(errors.firstName).toEqual(expect.any(String));
  });

  test('accepts logo and webhook cleared with null', () => {
    expect(validateUpdateMerchant({ logo: null, webhook: null })).toEqual({});
  });

  test('accepts an empty string webhook as a clear', () => {
    expect(validateUpdateMerchant({ webhook: '' })).toEqual({});
  });

  test('rejects a non-HTTPS webhook URL', () => {
    const errors = validateUpdateMerchant({ webhook: 'http://example.com/hook' });
    expect(errors.webhook).toEqual(expect.any(String));
  });

  test('rejects a malformed webhook URL', () => {
    const errors = validateUpdateMerchant({ webhook: 'not-a-url' });
    expect(errors.webhook).toEqual(expect.any(String));
  });

  test('accepts a valid HTTPS webhook URL', () => {
    expect(validateUpdateMerchant({ webhook: 'https://example.com/hook' })).toEqual({});
  });

  test('rejects a non-string logo', () => {
    const errors = validateUpdateMerchant({ logo: 123 });
    expect(errors.logo).toEqual(expect.any(String));
  });
});
