import { Request, Response } from 'express';
import { StrKey } from '@stellar/stellar-sdk';
import { createNonce, authenticateWallet } from '../services/auth.services.js';
import { resendEmailOtp, verifyEmailOtp } from '../services/otp.services.js';
import { sanitizeMerchant } from '../services/merchant.services.js';
import { AppError } from '../utils/errors.js';
import { recordAuditLog, ActorType } from '../services/audit-log.services.js';

export const createNonceController = async (req: Request, res: Response) => {
  try {
    const { address } = req.body;
    if (!address || typeof address !== 'string') {
      res.status(400).json({ error: 'address is required' });
      return;
    }
    const result = await createNonce(address);
    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const createChallengeController = async (req: Request, res: Response) => {
  try {
    const { address } = req.body ?? {};
    if (!address || typeof address !== 'string' || !StrKey.isValidEd25519PublicKey(address)) {
      res.status(400).json({ error: 'Invalid Stellar address' });
      return;
    }

    const result = await createNonce(address);
    res.status(200).json(result);
  } catch (error) {
    console.error('Failed to create auth challenge', {
      path: req.path,
      method: req.method,
      address: typeof req.body?.address === 'string' ? req.body.address : undefined,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const verifySignatureController = async (req: Request, res: Response) => {
  try {
    const { address, nonce, signature } = req.body;
    if (!address || !nonce || !signature) {
      res.status(400).json({ error: 'address, nonce, and signature are required' });
      return;
    }
    if (typeof address !== 'string' || typeof nonce !== 'string' || typeof signature !== 'string') {
      res.status(400).json({ error: 'address, nonce, and signature must be strings' });
      return;
    }

    const result = await authenticateWallet(address, nonce, signature);

    if (!result.success) {
      res.status(401).json({ error: result.reason });
      return;
    }

    res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      merchant: result.merchant,
    });
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const verifyEmailController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;

  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  try {
    const updatedMerchant = await verifyEmailOtp(merchant.id, code.trim());
    await recordAuditLog({
      action: 'merchant.email_verified',
      actorType: ActorType.MERCHANT,
      actorId: merchant.id,
      actorLabel: merchant.businessName ?? merchant.address,
      targetType: 'Merchant',
      targetId: merchant.id,
    });
    res.status(200).json(sanitizeMerchant(updatedMerchant));
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const resendOtpController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;

  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    await resendEmailOtp(merchant.id);
    await recordAuditLog({
      action: 'merchant.otp_resent',
      actorType: ActorType.MERCHANT,
      actorId: merchant.id,
      actorLabel: merchant.businessName ?? merchant.address,
      targetType: 'Merchant',
      targetId: merchant.id,
    });
    res.status(200).json({ message: 'Verification code sent' });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
