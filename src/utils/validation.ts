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

export interface UpdateMerchantInput {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  category?: string;
  description?: string;
  logo?: string | null;
  webhook?: string | null;
}

const EDITABLE_MERCHANT_FIELDS = [
  'firstName',
  'lastName',
  'businessName',
  'category',
  'description',
  'logo',
  'webhook',
] as const;

const UPDATE_REQUIRED_TEXT_FIELDS = [
  'firstName',
  'lastName',
  'businessName',
  'category',
  'description',
] as const;

const isValidHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export const validateUpdateMerchant = (body: unknown): ValidationErrors => {
  const errors: ValidationErrors = {};
  const payload = (body ?? {}) as Record<string, unknown>;

  const present = EDITABLE_MERCHANT_FIELDS.filter(field => payload[field] !== undefined);
  if (present.length === 0) {
    errors._empty = 'At least one valid field is required';
    return errors;
  }

  for (const field of UPDATE_REQUIRED_TEXT_FIELDS) {
    if (payload[field] !== undefined && !isNonEmptyString(payload[field])) {
      errors[field] = `${field} must be a non-empty string`;
    }
  }

  if (payload.logo !== undefined && payload.logo !== null && typeof payload.logo !== 'string') {
    errors.logo = 'logo must be a string or null';
  }

  if (payload.webhook !== undefined && payload.webhook !== null) {
    if (typeof payload.webhook !== 'string') {
      errors.webhook = 'webhook must be a string or null';
    } else if (payload.webhook.trim().length > 0 && !isValidHttpsUrl(payload.webhook.trim())) {
      errors.webhook = 'webhook must be a valid HTTPS URL';
    }
  }

  return errors;
};
