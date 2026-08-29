import { Request, Response } from 'express';
import {
  blockMerchant,
  getAdminMerchant,
  listAdminMerchantInvoices,
  listAdminMerchants,
} from '../services/merchant.services.js';
import { getMerchantAdminAnalytics } from '../services/analytics.services.js';
import { parseAdminMerchantListQuery } from '../utils/merchant.validation.js';
import { parseInvoiceListQuery } from '../utils/invoice.validation.js';
import { recordAuditLog, ActorType } from '../services/audit-log.services.js';
import { AppError } from '../utils/errors.js';

export const listAdminMerchantsController = async (req: Request, res: Response): Promise<void> => {
  const { filters, pagination, sortBy, sortDir, errors } = parseAdminMerchantListQuery(
    req.query as Record<string, unknown>,
  );
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Validation failed', errors });
    return;
  }

  try {
    const result = await listAdminMerchants(filters, pagination, sortBy, sortDir);
    res.status(200).json(result);
  } catch (error) {
    handleError(error, req, res);
  }
};

export const getAdminMerchantController = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchant = await getAdminMerchant(req.params.id as string);
    res.status(200).json(merchant);
  } catch (error) {
    handleError(error, req, res);
  }
};

export const getAdminMerchantInvoicesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { filters, pagination, errors } = parseInvoiceListQuery(
    req.query as Record<string, unknown>,
  );
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Validation failed', errors });
    return;
  }

  try {
    const result = await listAdminMerchantInvoices(req.params.id as string, filters, pagination);
    res.status(200).json(result);
  } catch (error) {
    handleError(error, req, res);
  }
};

export const getAdminMerchantAnalyticsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await getMerchantAdminAnalytics(req.params.id as string);
    res.status(200).json(result);
  } catch (error) {
    handleError(error, req, res);
  }
};

export const blockMerchantController = async (req: Request, res: Response): Promise<void> => {
  const admin = req.admin;
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const reason =
    typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim()
      : undefined;

  try {
    const merchant = await blockMerchant(req.params.id as string);

    // Off-chain only: the merchant is deactivated in this projection now. The
    // contract's set_merchant_status requires the on-chain admin's signature,
    // which this backend cannot produce, so on-chain reconciliation is deferred.
    await recordAuditLog({
      action: 'merchant.blocked',
      actorType: ActorType.ADMIN,
      actorId: admin.id,
      actorLabel: admin.address,
      targetType: 'Merchant',
      targetId: merchant.id,
      metadata: reason ? { reason } : undefined,
    });

    res.status(200).json(merchant);
  } catch (error) {
    handleError(error, req, res);
  }
};

const handleError = (error: unknown, req: Request, res: Response): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error('Failed to handle admin merchant request', {
    path: req.path,
    method: req.method,
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  res.status(500).json({ error: 'Internal Server Error' });
};
