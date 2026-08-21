import { Request, Response } from 'express';
import {
  amendInvoice,
  createInvoice,
  getInvoice,
  getInvoiceWithMerchant,
  listInvoices,
  voidInvoice,
} from '../services/invoice.services.js';
import { parseInvoiceListQuery, validateCreateInvoice } from '../utils/invoice.validation.js';
import { AppError } from '../utils/errors.js';
import { generateInvoicePdf } from '../services/invoice-pdf.services.js';
import { sendInvoiceEmail } from '../services/email.service.js';
import { recordAuditLog, ActorType } from '../services/audit-log.services.js';

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
    await recordAuditLog({
      action: 'invoice.created',
      actorType: ActorType.MERCHANT,
      actorId: merchant.id,
      actorLabel: merchant.businessName ?? merchant.address,
      targetType: 'Invoice',
      targetId: invoice.id,
    });
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
    const invoice = await getInvoice(merchant.id, req.params.id as string);
    res.status(200).json(invoice);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const amendInvoiceController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;
  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const invoice = await amendInvoice(merchant.id, req.params.id, req.body);
    await recordAuditLog({
      action: 'invoice.amended',
      actorType: ActorType.MERCHANT,
      actorId: merchant.id,
      actorLabel: merchant.businessName ?? merchant.address,
      targetType: 'Invoice',
      targetId: invoice.id,
    });
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
    const invoice = await voidInvoice(merchant.id, req.params.id as string);
    await recordAuditLog({
      action: 'invoice.voided',
      actorType: ActorType.MERCHANT,
      actorId: merchant.id,
      actorLabel: merchant.businessName ?? merchant.address,
      targetType: 'Invoice',
      targetId: invoice.id,
    });
    res.status(200).json(invoice);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getInvoicePdfController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;
  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const invoice = await getInvoiceWithMerchant(merchant.id, req.params.id as string);
    const pdf = await generateInvoicePdf(invoice, invoice.merchant);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${invoice.paymentSlug}.pdf"`,
    );
    res.status(200).send(pdf);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const sendInvoiceController = async (req: Request, res: Response): Promise<void> => {
  const merchant = req.merchant;
  if (!merchant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const invoice = await getInvoiceWithMerchant(merchant.id, req.params.id as string);

    if (!invoice.email) {
      res.status(400).json({ error: 'Invoice has no email on file' });
      return;
    }

    await sendInvoiceEmail(invoice, invoice.merchant);
    await recordAuditLog({
      action: 'invoice.email_sent',
      actorType: ActorType.MERCHANT,
      actorId: merchant.id,
      actorLabel: merchant.businessName ?? merchant.address,
      targetType: 'Invoice',
      targetId: invoice.id,
    });
    res.status(200).json({ message: 'Invoice email sent' });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
