import { Request, Response } from 'express';
import { createNonce, authenticateWallet } from '../services/auth.services.js';

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
