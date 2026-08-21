import { Request, Response } from 'express';
import { blockMerchant } from '../services/merchant.services.js';
import { recordAuditLog, ActorType } from '../services/audit-log.services.js';
import { AppError } from '../utils/errors.js';

export const blockMerchantController = async (req: Request, res: Response): Promise<void> => {
  const admin = req.admin;
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const merchant = await blockMerchant(req.params.id as string);
    await recordAuditLog({
      action: 'merchant.blocked',
      actorType: ActorType.ADMIN,
      actorId: admin.id,
      actorLabel: admin.address,
      targetType: 'Merchant',
      targetId: merchant.id,
    });
    res.status(200).json(merchant);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
