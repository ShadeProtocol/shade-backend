import { randomBytes } from 'crypto';

/**
 * Generates a url-safe, collision-resistant payment slug.
 *
 * Uses base64url encoding (characters A-Z, a-z, 0-9, `-`, `_`) so the slug can
 * be embedded directly in a payment URL without escaping. 12 random bytes yield
 * 16 characters and ~96 bits of entropy.
 */
export const generatePaymentSlug = (): string => randomBytes(12).toString('base64url');
