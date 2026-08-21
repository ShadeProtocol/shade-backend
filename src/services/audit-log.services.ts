import type { ActorType as PrismaActorType, Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import type { AuditLogFilters, AuditLogPagination } from '../utils/audit-log.validation.js';

// Local const mirrors the codebase's existing convention (see InvoiceStatus in
// invoice.services.ts) of never importing a runtime enum value from
// @prisma/client, since the generated client is mocked in tests.
export const ActorType = {
  ADMIN: 'ADMIN',
  MERCHANT: 'MERCHANT',
  ANONYMOUS: 'ANONYMOUS',
  SYSTEM: 'SYSTEM',
} as const satisfies Record<string, PrismaActorType>;

export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export interface RecordAuditLogInput {
  action: string;
  actorType: ActorType;
  actorId?: string;
  actorLabel: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * The only function anywhere in the codebase that should write to `AdminLog`.
 *
 * A failure here (DB hiccup, etc.) is swallowed and logged to console.error —
 * never rethrown. An audit-trail bug becoming a user-facing 500 on the
 * operation being logged would be a worse outcome than a missing log row.
 */
export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  try {
    await prisma.adminLog.create({
      data: {
        action: input.action,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (error) {
    console.error('Failed to record audit log', {
      action: input.action,
      actorType: input.actorType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export const sanitizeAuditLog = (log: {
  id: string;
  action: string;
  actorType: ActorType;
  actorId: string | null;
  actorLabel: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}) => ({
  id: log.id,
  action: log.action,
  actorType: log.actorType,
  actorId: log.actorId,
  actorLabel: log.actorLabel,
  targetType: log.targetType,
  targetId: log.targetId,
  metadata: log.metadata,
  createdAt: log.createdAt,
});

export const listAuditLogs = async (filters: AuditLogFilters, pagination: AuditLogPagination) => {
  const where: Prisma.AdminLogWhereInput = {};

  if (filters.action) where.action = filters.action;
  if (filters.actorType) where.actorType = filters.actorType;
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.targetType) where.targetType = filters.targetType;
  if (filters.targetId) where.targetId = filters.targetId;

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }

  const [logs, total] = await Promise.all([
    prisma.adminLog.findMany({
      where,
      take: pagination.limit,
      skip: pagination.offset,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.adminLog.count({ where }),
  ]);

  return {
    data: logs.map(sanitizeAuditLog),
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      total,
    },
  };
};
