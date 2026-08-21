import type { ActorType } from '@prisma/client';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// String constants matching the Prisma `ActorType` enum. Defined locally so this
// module never imports a runtime value from `@prisma/client` (the generated
// client is mocked in tests and not generated in CI).
const ACTOR_TYPES = [
  'ADMIN',
  'MERCHANT',
  'ANONYMOUS',
  'SYSTEM',
] as const satisfies readonly ActorType[];

export interface AuditLogFilters {
  action?: string;
  actorType?: ActorType;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogPagination {
  limit: number;
  offset: number;
}

export type ValidationErrors = Record<string, string>;

export interface ParsedAuditLogListQuery {
  filters: AuditLogFilters;
  pagination: AuditLogPagination;
  errors: ValidationErrors;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Parses admin log list query parameters into typed filters and pagination,
 * clamping the page size to [1, MAX_LIMIT] and defaulting to DEFAULT_LIMIT.
 * Mirrors parseInvoiceListQuery in invoice.validation.ts.
 */
export const parseAuditLogListQuery = (query: Record<string, unknown>): ParsedAuditLogListQuery => {
  const errors: ValidationErrors = {};
  const filters: AuditLogFilters = {};

  if (isNonEmptyString(query.action)) {
    filters.action = query.action.trim();
  }

  if (query.actorType !== undefined) {
    const actorType = String(query.actorType).toUpperCase();
    if ((ACTOR_TYPES as readonly string[]).includes(actorType)) {
      filters.actorType = actorType as ActorType;
    } else {
      errors.actorType = `actorType must be one of ${ACTOR_TYPES.join(', ')}`;
    }
  }

  if (isNonEmptyString(query.actorId)) {
    filters.actorId = query.actorId.trim();
  }

  if (isNonEmptyString(query.targetType)) {
    filters.targetType = query.targetType.trim();
  }

  if (isNonEmptyString(query.targetId)) {
    filters.targetId = query.targetId.trim();
  }

  if (query.from !== undefined) {
    const date = new Date(String(query.from));
    if (Number.isNaN(date.getTime())) {
      errors.from = 'from must be a valid date';
    } else {
      filters.from = date;
    }
  }

  if (query.to !== undefined) {
    const date = new Date(String(query.to));
    if (Number.isNaN(date.getTime())) {
      errors.to = 'to must be a valid date';
    } else {
      filters.to = date;
    }
  }

  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    const parsed = Number(query.limit);
    if (!Number.isFinite(parsed) || parsed < 1) {
      errors.limit = 'limit must be a positive number';
    } else {
      limit = Math.min(Math.floor(parsed), MAX_LIMIT);
    }
  }

  let offset = 0;
  if (query.offset !== undefined) {
    const parsed = Number(query.offset);
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.offset = 'offset must be a non-negative number';
    } else {
      offset = Math.floor(parsed);
    }
  }

  return { filters, pagination: { limit, offset }, errors };
};
