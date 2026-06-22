const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterMerchantInput {
  firstName: string;
  lastName: string;
  email: string;
  businessName: string;
  category: string;
  description: string;
  logo?: string;
}

export type ValidationErrors = Record<string, string>;

const REQUIRED_FIELDS: (keyof RegisterMerchantInput)[] = [
  'firstName',
  'lastName',
  'email',
  'businessName',
  'category',
  'description',
];

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const validateRegisterMerchant = (body: unknown): ValidationErrors => {
  const errors: ValidationErrors = {};
  const payload = (body ?? {}) as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!isNonEmptyString(payload[field])) {
      errors[field] = `${field} is required`;
    }
  }

  if (isNonEmptyString(payload.email) && !EMAIL_REGEX.test(payload.email.trim())) {
    errors.email = 'A valid email is required';
  }

  if (payload.logo !== undefined && typeof payload.logo !== 'string') {
    errors.logo = 'logo must be a string';
  }

  return errors;
};
