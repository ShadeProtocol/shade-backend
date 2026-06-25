import { Request, Response } from 'express';
import { createNonce, authenticateWallet } from '../services/auth.services.js';
import { resendEmailOtp, verifyEmailOtp } from '../services/otp.services.js';
import { sanitizeMerchant } from '../services/merchant.services.js';
import { AppError } from '../utils/errors.js';

export const createNonceController = async (req: Request, res: Response) => {
  try {
    const { address } = req.body;
    if (!address || typeof address !== 'string') {
      res.status(400).json({ error: 'address is required' });
      return;
    }
    const result = await createNonce(address);
    res.status(201).json(result);
  } catch (error) {
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
  } catch (error) {
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
    res.status(200).json({ message: 'Verification code sent' });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
