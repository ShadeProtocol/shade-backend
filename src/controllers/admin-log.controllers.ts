import { Request, Response } from 'express';
import { listAuditLogs } from '../services/audit-log.services.js';
import { parseAuditLogListQuery } from '../utils/audit-log.validation.js';

export const listAuditLogsController = async (req: Request, res: Response): Promise<void> => {
  const { filters, pagination, errors } = parseAuditLogListQuery(
    req.query as Record<string, unknown>,
  );
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Validation failed', errors });
    return;
  }

  try {
    const result = await listAuditLogs(filters, pagination);
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
