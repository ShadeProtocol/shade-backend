# Merchant Profile API (Get & Update) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /merchants/me` and `PATCH /merchants/me` so an authenticated merchant can view and partially update their own profile.

**Architecture:** Follows the existing layering — routes → thin controllers → services (prisma + `AppError`) → `sanitizeMerchant` allow-list for output. A new `validateUpdateMerchant` validator gates the PATCH payload; the service writes only editable fields; output goes through the existing allow-list so internal fields/relations are never exposed.

**Tech Stack:** TypeScript (ESM), Express v5, Prisma, Jest + ts-jest (ESM), supertest, jest-mock-extended.

## Global Constraints

- Base API path is `/api/v1` — merchant routes are mounted at `/api/v1/merchants`.
- ESM project: all relative imports MUST use the `.js` extension (e.g. `'../utils/errors.js'`).
- Tests live under `tests/` (`tests/unit/`, `tests/integration/`) and use the shared `prismaMock` from `tests/__mocks__/prisma.ts` (imported via `await import('../../src/config/prisma.js')`).
- Auth is simulated by mocking `prismaMock.refreshToken.findUnique` to return a session with `expiresAt` in the future and a `merchant` object (see existing `authenticateAs` helper).
- Editable fields: `firstName`, `lastName`, `businessName`, `category`, `description`, `logo`, `webhook`. Non-editable (silently ignored): everything else, explicitly `address`, `email`, `merchantId`, `account`.
- Run a single test file with: `npm test -- <path>`.

---

### Task 1: `validateUpdateMerchant` validator

**Files:**
- Modify: `src/utils/validation.ts`
- Test: `tests/unit/merchant.update.validation.test.ts` (create)

**Interfaces:**
- Consumes: existing `ValidationErrors` type and `isNonEmptyString` helper in `src/utils/validation.ts`.
- Produces:
  - `interface UpdateMerchantInput { firstName?: string; lastName?: string; businessName?: string; category?: string; description?: string; logo?: string | null; webhook?: string | null; }`
  - `validateUpdateMerchant(body: unknown): ValidationErrors` — returns `{}` when valid; on the empty-payload case returns `{ _empty: '...' }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/merchant.update.validation.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/unit/merchant.update.validation.test.ts`
Expected: FAIL — `validateUpdateMerchant` is not exported / not a function.

- [ ] **Step 3: Implement the validator**

Append to `src/utils/validation.ts` (keep the existing `EMAIL_REGEX`, `isNonEmptyString`, `validateRegisterMerchant`):

```ts
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

  const present = EDITABLE_MERCHANT_FIELDS.filter((field) => payload[field] !== undefined);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/unit/merchant.update.validation.test.ts`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/validation.ts tests/unit/merchant.update.validation.test.ts
git commit -m "feat: add validateUpdateMerchant validator (#11)"
```

---

### Task 2: Service layer — `getMyProfile`, `updateMyProfile`, extend `sanitizeMerchant`

**Files:**
- Modify: `src/services/merchant.services.ts`
- Test: `tests/unit/merchant.profile.services.test.ts` (create)

**Interfaces:**
- Consumes: `prisma` (`../config/prisma.js`), `AppError` (`../utils/errors.js`), `UpdateMerchantInput` (`../utils/validation.js`), existing `sanitizeMerchant`.
- Produces:
  - `getMyProfile(id: string): Promise<ReturnType<typeof sanitizeMerchant>>` — throws `AppError(404, 'Merchant not found')` when missing.
  - `updateMyProfile(id: string, data: UpdateMerchantInput): Promise<ReturnType<typeof sanitizeMerchant>>` — writes only editable fields present in `data`; trims strings; normalizes empty `logo`/`webhook` to `null`.
  - `sanitizeMerchant` now additionally returns `account` and `webhook`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/merchant.profile.services.test.ts`:

```ts
import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { getMyProfile, updateMyProfile } = await import('../../src/services/merchant.services.js');

const baseMerchant = {
  id: 'uuid-1',
  merchantId: 1,
  address: '0x123',
  account: 'CCONTRACT',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  businessName: 'Analytical Engines',
  category: 'software',
  description: 'We build computing machines.',
  logo: 'https://example.com/logo.png',
  webhook: null,
  active: true,
  verified: false,
  emailVerified: false,
  registered: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('getMyProfile', () => {
  beforeEach(() => mockReset(prismaMock));

  test('returns the sanitized profile including account and webhook', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(baseMerchant);

    const result = await getMyProfile('uuid-1');

    expect(prismaMock.merchant.findUnique).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    expect(result).toMatchObject({ id: 'uuid-1', account: 'CCONTRACT', webhook: null });
    expect(result).not.toHaveProperty('refreshTokens');
    expect(result).not.toHaveProperty('apiKeys');
  });

  test('throws AppError(404) when the merchant does not exist', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    await expect(getMyProfile('missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateMyProfile', () => {
  beforeEach(() => mockReset(prismaMock));

  test('writes only the editable fields present in the payload, trimmed', async () => {
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    await updateMyProfile('uuid-1', {
      firstName: '  Grace  ',
      webhook: 'https://example.com/hook',
    });

    expect(prismaMock.merchant.update).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
      data: { firstName: 'Grace', webhook: 'https://example.com/hook' },
    });
  });

  test('normalizes a cleared logo/webhook to null', async () => {
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    await updateMyProfile('uuid-1', { logo: '', webhook: null });

    expect(prismaMock.merchant.update).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
      data: { logo: null, webhook: null },
    });
  });

  test('returns the sanitized updated profile', async () => {
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    const result = await updateMyProfile('uuid-1', { businessName: 'New Co' });

    expect(result).toMatchObject({ businessName: 'New Co' });
    expect(result).not.toHaveProperty('refreshTokens');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/unit/merchant.profile.services.test.ts`
Expected: FAIL — `getMyProfile`/`updateMyProfile` not exported.

- [ ] **Step 3: Extend `sanitizeMerchant` and add the service functions**

In `src/services/merchant.services.ts`, update the imports line to also import `Prisma` and `UpdateMerchantInput`:

```ts
import { Merchant, Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { RegisterMerchantInput, UpdateMerchantInput } from '../utils/validation.js';
import { sendOtpEmail } from './otp.services.js';
```

Add `account` and `webhook` to the `sanitizeMerchant` allow-list (place `account` after `address`, `webhook` after `logo`):

```ts
export const sanitizeMerchant = (merchant: Merchant) => ({
  id: merchant.id,
  merchantId: merchant.merchantId,
  email: merchant.email,
  address: merchant.address,
  account: merchant.account,
  firstName: merchant.firstName,
  lastName: merchant.lastName,
  businessName: merchant.businessName,
  category: merchant.category,
  description: merchant.description,
  logo: merchant.logo,
  webhook: merchant.webhook,
  active: merchant.active,
  verified: merchant.verified,
  emailVerified: merchant.emailVerified,
  registered: merchant.registered,
  createdAt: merchant.createdAt,
  updatedAt: merchant.updatedAt,
});
```

Append the two new service functions at the end of the file:

```ts
/**
 * Returns the authenticated merchant's own profile.
 */
export const getMyProfile = async (id: string) => {
  const merchant = await prisma.merchant.findUnique({ where: { id } });

  if (!merchant) {
    throw new AppError(404, 'Merchant not found');
  }

  return sanitizeMerchant(merchant);
};

/**
 * Partially updates the authenticated merchant's editable profile fields.
 *
 * Only fields present in `data` are written. Strings are trimmed; an empty
 * `logo`/`webhook` is normalized to null so the merchant can clear them.
 * Non-editable fields are never read here, so they cannot be changed.
 */
export const updateMyProfile = async (id: string, data: UpdateMerchantInput) => {
  const updateData: Prisma.MerchantUpdateInput = {};

  const textFields = ['firstName', 'lastName', 'businessName', 'category', 'description'] as const;
  for (const field of textFields) {
    const value = data[field];
    if (value !== undefined) {
      updateData[field] = value.trim();
    }
  }

  if (data.logo !== undefined) {
    const logo = typeof data.logo === 'string' ? data.logo.trim() : data.logo;
    updateData.logo = logo ? logo : null;
  }

  if (data.webhook !== undefined) {
    const webhook = typeof data.webhook === 'string' ? data.webhook.trim() : data.webhook;
    updateData.webhook = webhook ? webhook : null;
  }

  const updated = await prisma.merchant.update({ where: { id }, data: updateData });

  return sanitizeMerchant(updated);
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/unit/merchant.profile.services.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Verify the existing service/register tests still pass**

Run: `npm test -- tests/unit/merchant.services.test.ts tests/integration/merchant.register.test.ts`
Expected: PASS — `sanitizeMerchant` additions are additive (register integration uses `toMatchObject`, so extra fields are fine).

- [ ] **Step 6: Commit**

```bash
git add src/services/merchant.services.ts tests/unit/merchant.profile.services.test.ts
git commit -m "feat: add getMyProfile/updateMyProfile services and expose account/webhook (#11)"
```

---

### Task 3: Controllers + routes wiring

**Files:**
- Modify: `src/controllers/merchant.controllers.ts`
- Modify: `src/routes/merchant.routes.ts`
- Test: `tests/integration/merchant.profile.test.ts` (create)

**Interfaces:**
- Consumes: `getMyProfile`, `updateMyProfile` (`../services/merchant.services.js`); `validateUpdateMerchant` (`../utils/validation.js`); `AppError` (`../utils/errors.js`); `authenticateMerchant` (`../middlewares/auth.middleware.js`); `req.merchant`.
- Produces: `getMyProfileController`, `updateMyProfileController` (Express handlers) and the routes `GET /merchants/me`, `PATCH /merchants/me`.

- [ ] **Step 1: Write the failing integration tests**

Create `tests/integration/merchant.profile.test.ts`:

```ts
import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import request from 'supertest';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { default: app } = await import('../../src/app.js');

const ME_URL = '/api/v1/merchants/me';

const baseMerchant = {
  id: 'uuid-1',
  merchantId: 1,
  address: '0x123',
  account: 'CCONTRACT',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  businessName: 'Analytical Engines',
  category: 'software',
  description: 'We build computing machines.',
  logo: null,
  webhook: null,
  active: true,
  verified: false,
  emailVerified: false,
  registered: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const authenticateAs = (merchant: Record<string, unknown>) => {
  prismaMock.refreshToken.findUnique.mockResolvedValue({
    id: 'session-1',
    merchantId: merchant.id,
    token: 'valid-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    merchant,
  } as any);
};

describe('GET /api/v1/merchants/me', () => {
  beforeEach(() => mockReset(prismaMock));

  test('returns 401 when unauthenticated', async () => {
    const response = await request(app).get(ME_URL);
    expect(response.status).toBe(401);
  });

  test('returns 200 with the full profile and no internal fields', async () => {
    authenticateAs(baseMerchant);
    prismaMock.merchant.findUnique.mockResolvedValue(baseMerchant as any);

    const response = await request(app).get(ME_URL).set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 'uuid-1', account: 'CCONTRACT', webhook: null });
    expect(response.body).not.toHaveProperty('refreshTokens');
    expect(response.body).not.toHaveProperty('apiKeys');
  });
});

describe('PATCH /api/v1/merchants/me', () => {
  beforeEach(() => mockReset(prismaMock));

  test('returns 401 when unauthenticated', async () => {
    const response = await request(app).patch(ME_URL).send({ firstName: 'Grace' });
    expect(response.status).toBe(401);
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('updates a valid partial payload and returns 200', async () => {
    authenticateAs(baseMerchant);
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: 'Grace', webhook: 'https://example.com/hook' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ firstName: 'Grace', webhook: 'https://example.com/hook' });
  });

  test('silently ignores non-editable fields (address/email)', async () => {
    authenticateAs(baseMerchant);
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: 'Grace', address: '0xHACK', email: 'evil@example.com' });

    expect(response.status).toBe(200);
    const updateArg = prismaMock.merchant.update.mock.calls[0][0];
    expect(updateArg.data).toEqual({ firstName: 'Grace' });
    expect(response.body.address).toBe('0x123');
    expect(response.body.email).toBe('ada@example.com');
  });

  test('returns 400 for an invalid (non-HTTPS) webhook', async () => {
    authenticateAs(baseMerchant);

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({ webhook: 'http://example.com/hook' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('clears the webhook when sent null', async () => {
    authenticateAs(baseMerchant);
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({ webhook: null });

    expect(response.status).toBe(200);
    expect(response.body.webhook).toBeNull();
  });

  test('returns 400 for a required text field sent empty', async () => {
    authenticateAs(baseMerchant);

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: '' });

    expect(response.status).toBe(400);
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('returns 400 for an empty payload', async () => {
    authenticateAs(baseMerchant);

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(response.status).toBe(400);
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/integration/merchant.profile.test.ts`
Expected: FAIL — routes return 404 / controllers not defined.

- [ ] **Step 3: Add the controllers**

In `src/controllers/merchant.controllers.ts`, extend the service import and add `validateUpdateMerchant` to the validation import:

```ts
import {
  createMerchant,
  getMerchant,
  listMerchants,
  registerMerchant,
  getMyProfile,
  updateMyProfile,
} from '../services/merchant.services.js';
import { validateRegisterMerchant, validateUpdateMerchant } from '../utils/validation.js';
```

Append the two controllers at the end of the file:

```ts
export const getMyProfileController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;

  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const profile = await getMyProfile(merchant.id);
    res.status(200).json(profile);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateMyProfileController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;

  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const errors = validateUpdateMerchant(req.body);
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Validation failed', errors });
    return;
  }

  try {
    const profile = await updateMyProfile(merchant.id, req.body);
    res.status(200).json(profile);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
```

- [ ] **Step 4: Wire the routes**

Replace the body of `src/routes/merchant.routes.ts` so the `/me` routes are registered **before** `/:id`:

```ts
import { Router } from 'express';
import {
  createMerchantController,
  getMerchantController,
  listMerchantsController,
  registerMerchantController,
  getMyProfileController,
  updateMyProfileController,
} from '../controllers/merchant.controllers.js';
import { authenticateMerchant } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', authenticateMerchant, registerMerchantController);
router.get('/me', authenticateMerchant, getMyProfileController);
router.patch('/me', authenticateMerchant, updateMyProfileController);
router.post('/', createMerchantController);
router.get('/:id', getMerchantController);
router.get('/', listMerchantsController);

export default router;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/integration/merchant.profile.test.ts`
Expected: PASS (all 9 tests).

- [ ] **Step 6: Run the full check + suite**

Run: `npm run check && npm test`
Expected: type-check, lint, format all clean; entire test suite PASS.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/merchant.controllers.ts src/routes/merchant.routes.ts tests/integration/merchant.profile.test.ts
git commit -m "feat: add GET/PATCH /merchants/me endpoints (#11)"
```

---

## Self-Review

**Spec coverage:**
- `GET /merchants/me` returns full profile → Task 2 (`getMyProfile`) + Task 3 (route/controller, integration test).
- `PATCH /merchants/me` partial update → Task 1 (validator) + Task 2 (`updateMyProfile`) + Task 3 (route/controller).
- Non-editable fields silently ignored → Task 1 (allow-list read) + Task 3 (`address`/`email` ignored test).
- Invalid webhook → 400 → Task 1 tests + Task 3 integration test.
- Unauthenticated → 401 → Task 3 integration tests (relies on existing `authenticateMerchant`).
- Never expose internal fields → Task 2 (`sanitizeMerchant` allow-list) + Task 3 (`not.toHaveProperty` assertions).
- Clear logo/webhook with null → Task 1 + Task 2 + Task 3.
- Required text empty → 400 → Task 1 + Task 3.
- Empty payload → 400 → Task 1 + Task 3.

**Placeholder scan:** none — all steps contain concrete code and exact commands.

**Type consistency:** `UpdateMerchantInput` defined in Task 1, consumed by `updateMyProfile` in Task 2 and the controller in Task 3. `getMyProfile(id: string)` / `updateMyProfile(id: string, data)` signatures match across service tests (Task 2) and controller calls (Task 3). `sanitizeMerchant` field additions (`account`, `webhook`) are consistent across Tasks 2 and 3 assertions.
