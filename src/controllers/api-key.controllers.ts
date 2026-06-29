import { Request, Response } from 'express';
import { createApiKey, listApiKeys, revokeApiKey } from '../services/api-key.services.js';
import { AppError } from '../utils/errors.js';

export const createApiKeyController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;

  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const label = typeof req.body?.label === 'string' ? req.body.label : undefined;

  try {
    const apiKey = await createApiKey(merchant.id, label);
    res.status(201).json(apiKey);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const listApiKeysController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;

  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const apiKeys = await listApiKeys(merchant.id);
    res.status(200).json(apiKeys);
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const revokeApiKeyController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;

  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    await revokeApiKey(merchant.id, req.params.id);
    res.status(200).json({ message: 'API key revoked' });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
