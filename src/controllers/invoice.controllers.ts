import { Request, Response } from 'express';
import {
  createInvoice,
  getInvoice,
  listInvoices,
  voidInvoice,
} from '../services/invoice.services.js';
import { parseInvoiceListQuery, validateCreateInvoice } from '../utils/invoice.validation.js';
import { AppError } from '../utils/errors.js';

export const createInvoiceController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;
  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const errors = validateCreateInvoice(req.body);
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Validation failed', errors });
    return;
  }

  try {
    const invoice = await createInvoice(merchant.id, req.body);
    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const listInvoicesController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;
  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { filters, pagination, errors } = parseInvoiceListQuery(
    req.query as Record<string, unknown>,
  );
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Validation failed', errors });
    return;
  }

  try {
    const result = await listInvoices(merchant.id, filters, pagination);
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getInvoiceController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;
  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const invoice = await getInvoice(merchant.id, req.params.id);
    res.status(200).json(invoice);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const voidInvoiceController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;
  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const invoice = await voidInvoice(merchant.id, req.params.id);
    res.status(200).json(invoice);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
