import { Request, Response } from 'express';
import { StrKey } from '@stellar/stellar-sdk';
import { createNonce } from '../services/auth.services.js';
import { authenticateAdminWallet } from '../services/admin-auth.services.js';

export const createAdminChallengeController = async (req: Request, res: Response) => {
  try {
    const { address } = req.body ?? {};
    if (!address || typeof address !== 'string' || !StrKey.isValidEd25519PublicKey(address)) {
      res.status(400).json({ error: 'Invalid Stellar address' });
      return;
    }

    const result = await createNonce(address);
    res.status(200).json(result);
  } catch (error) {
    console.error('Failed to create admin auth challenge', {
      path: req.path,
      method: req.method,
      address: typeof req.body?.address === 'string' ? req.body.address : undefined,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const verifyAdminSignatureController = async (req: Request, res: Response) => {
  try {
    const { address, nonce, signature } = req.body ?? {};
    if (!address || !nonce || !signature) {
      res.status(400).json({ error: 'address, nonce, and signature are required' });
      return;
    }
    if (typeof address !== 'string' || typeof nonce !== 'string' || typeof signature !== 'string') {
      res.status(400).json({ error: 'address, nonce, and signature must be strings' });
      return;
    }

    const result = await authenticateAdminWallet(address, nonce, signature);

    if (!result.success) {
      res.status(401).json({ error: result.reason });
      return;
    }

    res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      admin: result.admin,
    });
  } catch (error) {
    console.error('Failed to verify admin auth signature', {
      path: req.path,
      method: req.method,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
