import { Request, Response } from 'express';
import { resolveInvoiceBySlug, confirmPayment } from '../services/pay.services.js';
import { AppError } from '../utils/errors.js';

export const resolveInvoiceController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const invoice = await resolveInvoiceBySlug(slug);
    res.status(200).json(invoice);
  } catch (error) {
    if (error instanceof AppError) {
      if (error.statusCode === 410 && error.message === 'expired') {
        res.status(410).json({ reason: 'expired' });
        return;
      }
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const confirmPaymentController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const { payerAddress, txHash } = req.body;

    if (!payerAddress || typeof payerAddress !== 'string') {
      res.status(400).json({ error: 'payerAddress is required and must be a string' });
      return;
    }

    if (txHash !== undefined && typeof txHash !== 'string') {
      res.status(400).json({ error: 'txHash must be a string if provided' });
      return;
    }

    await confirmPayment(slug, payerAddress, txHash);
    res.status(202).json({ message: 'Payment confirmation received' });
  } catch (error) {
    if (error instanceof AppError) {
      if (error.statusCode === 410 && error.message === 'expired') {
        res.status(410).json({ reason: 'expired' });
        return;
      }
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
