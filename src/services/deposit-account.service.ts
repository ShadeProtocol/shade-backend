import { Horizon, Keypair } from '@stellar/stellar-sdk';
import type { DepositAccount } from '@prisma/client';
import prisma from '../config/prisma.js';
import { encrypt } from '../utils/encryption.js';
import { AppError } from '../utils/errors.js';

export interface DepositAccountSummary {
  id: string;
  address: string;
  invoiceId: string | null;
  inUse: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function sanitizeDepositAccount(account: DepositAccount): DepositAccountSummary {
  return {
    id: account.id,
    address: account.address,
    invoiceId: account.invoiceId,
    inUse: account.inUse,
    lastUsedAt: account.lastUsedAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export class DepositAccountService {
  constructor(private horizon: Horizon.Server) {}

  async createAccount(): Promise<DepositAccountSummary> {
    const keypair = Keypair.random();
    const encryptedSecret = encrypt(keypair.secret());

    const account = await prisma.depositAccount.create({
      data: {
        address: keypair.publicKey(),
        encryptedSecret,
        inUse: false,
        invoiceId: null,
      },
    });

    return sanitizeDepositAccount(account);
  }

  async getAllAccounts(): Promise<DepositAccountSummary[]> {
    const accounts = await prisma.depositAccount.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return accounts.map(sanitizeDepositAccount);
  }

  async getAccountBalance(
    address: string,
  ): Promise<Awaited<ReturnType<Horizon.Server['loadAccount']>>['balances']> {
    try {
      const account = await this.horizon.loadAccount(address);
      return account.balances;
    } catch (error: unknown) {
      const err = error as { response?: { status?: number }; status?: number; name?: string };
      if (err?.response?.status === 404 || err?.status === 404 || err?.name === 'NotFoundError') {
        return [];
      }
      throw error;
    }
  }

  async getAvailableAccounts(): Promise<DepositAccountSummary[]> {
    const accounts = await prisma.depositAccount.findMany({
      where: { inUse: false },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(sanitizeDepositAccount);
  }

  async assignAccount(invoiceId: string): Promise<DepositAccountSummary> {
    while (true) {
      const candidates = await prisma.depositAccount.findMany({
        where: { inUse: false },
        orderBy: { createdAt: 'asc' },
      });

      if (candidates.length === 0) {
        throw new AppError(404, 'No available deposit accounts');
      }

      const now = new Date();

      for (const candidate of candidates) {
        try {
          const result = await prisma.depositAccount.updateMany({
            where: {
              id: candidate.id,
              inUse: false,
            },
            data: {
              inUse: true,
              invoiceId,
              lastUsedAt: now,
            },
          });

          if (result.count === 1) {
            const updated = await prisma.depositAccount.findUnique({
              where: { id: candidate.id },
            });
            return sanitizeDepositAccount(updated!);
          }
        } catch (error: unknown) {
          const err = error as { code?: string };
          if (err?.code === 'P2002') {
            throw new AppError(409, 'Invoice already has an assigned deposit account');
          }
          throw error;
        }
      }
    }
  }

  async releaseAccount(accountId: string): Promise<DepositAccountSummary> {
    const account = await prisma.depositAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new AppError(404, 'Deposit account not found');
    }

    const updated = await prisma.depositAccount.update({
      where: { id: accountId },
      data: {
        invoiceId: null,
        inUse: false,
        lastUsedAt: new Date(),
      },
    });

    return sanitizeDepositAccount(updated);
  }
}
