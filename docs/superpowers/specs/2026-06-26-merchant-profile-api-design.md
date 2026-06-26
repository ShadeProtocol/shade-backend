# Merchant Profile API (Get & Update) — Design

**Issue:** [#11](https://github.com/ShadeProtocol/shade-backend/issues/11)
**Date:** 2026-06-26
**Branch:** `feat/#11`

## Background

The frontend dashboard needs a profile/settings page where an authenticated
merchant can view and update their own information. This requires:

- `GET /merchants/me` — load the current merchant profile.
- `PATCH /merchants/me` — partial update of editable fields.

Both endpoints operate on the **authenticated** merchant (`req.merchant`), never
on an arbitrary merchant by id.

## Goals / Acceptance Criteria

- `GET /merchants/me` returns the full profile of the authenticated merchant.
- `PATCH /merchants/me` with a valid partial payload → `200` with updated profile.
- `PATCH /merchants/me` attempting to change non-editable fields (`address`,
  `email`, `merchantId`, `account`) → those fields are silently ignored.
- Invalid `webhook` URL format → `400`.
- Unauthenticated request to either endpoint → `401`.
- Response never exposes internal fields (relations such as `apiKeys`,
  `refreshTokens`, etc.). Enforced by the existing allow-list `sanitizeMerchant`.

## Editable vs Non-Editable Fields

**Editable via PATCH:** `firstName`, `lastName`, `businessName`, `category`,
`description`, `logo`, `webhook`.

**Non-editable (silently ignored if sent):** `address`, `email`, `merchantId`,
`account`, and any other field.

> Note: the issue refers to `accountContract`; the actual schema field is
> `account`. We treat `account` as the non-editable field.

## Design Decisions

1. **Clearing optional fields:** `logo` and `webhook` may be cleared by sending
   `null` (or `""`, normalized to `null`). A non-empty `webhook` string must be a
   valid HTTPS URL.
2. **Required text fields:** `firstName`, `lastName`, `businessName`, `category`,
   `description` were required at registration. If present in the PATCH payload
   they must be non-empty strings; `""` → `400`. They cannot be cleared via this
   endpoint.
3. **Empty payload:** a PATCH with no valid editable field present → `400`
   (`"At least one valid field is required"`).
4. **Silently ignore forbidden fields:** the validator/service only ever reads
   from the editable allow-list, so non-editable fields are never written and
   never error.

## Architecture

Follows the existing layering: routes → controllers (thin) → services (prisma +
`AppError`) → `sanitizeMerchant` for output.

### 1. Routes — `src/routes/merchant.routes.ts`

```ts
router.get('/me', authenticateMerchant, getMyProfileController);
router.patch('/me', authenticateMerchant, updateMyProfileController);
```

**Ordering:** register `/me` routes **before** the existing `/:id` route so
`/me` is not captured by the `:id` param.

### 2. Validation — `src/utils/validation.ts`

New `UpdateMerchantInput` type (all fields optional) and
`validateUpdateMerchant(body): ValidationErrors`:

- Read only from the editable allow-list.
- Required text fields, if present → must be non-empty string, else error.
- `logo`, if present → string or `null`.
- `webhook`, if present → `null`/`""` (clear) or a valid `https:` URL (validated
  with the native `URL` constructor + `protocol === 'https:'`), else error.
- If no editable field is present → `_empty` error.

### 3. Service — `src/services/merchant.services.ts`

- `getMyProfile(id: string)`: `findUnique({ where: { id } })`; if missing →
  `AppError(404, 'Merchant not found')`; return `sanitizeMerchant(merchant)`.
- `updateMyProfile(id: string, data: UpdateMerchantInput)`: build the Prisma
  `data` object only from editable fields present in the payload (trim strings;
  set `null` for cleared `logo`/`webhook`); `prisma.merchant.update`; return
  `sanitizeMerchant(updated)`.
- **Extend `sanitizeMerchant`** to also include `webhook` and `account` so the
  "full profile" reflects editable/relevant fields. The allow-list remains
  intact — no internal fields or relations are added.

### 4. Controllers — `src/controllers/merchant.controllers.ts`

Mirror `registerMerchantController`:

- `getMyProfileController`: check `req.merchant` → 401; call `getMyProfile`;
  200 with profile; `AppError` → its status; else 500.
- `updateMyProfileController`: check `req.merchant` → 401;
  `validateUpdateMerchant` → 400 `{ error: 'Validation failed', errors }`;
  call `updateMyProfile`; 200 with updated profile; `AppError` → its status;
  else 500.

## Testing

Jest + supertest, following the existing `*.routes.test.ts` patterns.

**GET /merchants/me**
- Authenticated → `200` with full profile.
- No / invalid token → `401`.
- Response does not expose internal fields/relations.

**PATCH /merchants/me**
- Valid partial payload → `200` with updated profile.
- Sending `address` / `email` / `merchantId` / `account` → silently ignored
  (unchanged in response).
- Invalid `webhook` (non-HTTPS / malformed) → `400`.
- `webhook: null` → clears the webhook.
- Required text field as `""` → `400`.
- Empty payload (no editable fields) → `400`.
- No / invalid token → `401`.

## Out of Scope

- Updating `email` (separate flow with OTP re-verification).
- Admin-level updates of other merchants.
- Webhook delivery/verification mechanics (only stores the URL).
