import { describe, expect, test } from '@jest/globals';
import { parseAdminMerchantListQuery } from '../../src/utils/merchant.validation.js';

describe('parseAdminMerchantListQuery', () => {
  test('returns default sort, pagination and empty filters for an empty query', () => {
    const result = parseAdminMerchantListQuery({});

    expect(result.errors).toEqual({});
    expect(result.filters).toEqual({});
    expect(result.sortBy).toBe('createdAt');
    expect(result.sortDir).toBe('desc');
    expect(result.pagination).toEqual({ limit: 20, offset: 0 });
  });

  test('parses boolean, category and search filters', () => {
    const result = parseAdminMerchantListQuery({
      active: 'true',
      verified: 'FALSE',
      category: '  software  ',
      search: '  engine  ',
    });

    expect(result.errors).toEqual({});
    expect(result.filters).toEqual({
      active: true,
      verified: false,
      category: 'software',
      search: 'engine',
    });
  });

  test('rejects a non-boolean active value', () => {
    const result = parseAdminMerchantListQuery({ active: 'yes' });

    expect(result.errors.active).toContain('true or false');
    expect(result.filters.active).toBeUndefined();
  });

  test('parses valid sortBy and sortDir', () => {
    const result = parseAdminMerchantListQuery({ sortBy: 'businessName', sortDir: 'ASC' });

    expect(result.errors).toEqual({});
    expect(result.sortBy).toBe('businessName');
    expect(result.sortDir).toBe('asc');
  });

  test('rejects an unknown sortBy and sortDir', () => {
    const result = parseAdminMerchantListQuery({ sortBy: 'password', sortDir: 'sideways' });

    expect(result.errors.sortBy).toContain('sortBy must be one of');
    expect(result.errors.sortDir).toContain('sortDir must be one of');
  });

  test('clamps limit to MAX_LIMIT and rejects a negative offset', () => {
    const result = parseAdminMerchantListQuery({ limit: '500', offset: '-1' });

    expect(result.pagination.limit).toBe(100);
    expect(result.errors.offset).toBeDefined();
  });
});
