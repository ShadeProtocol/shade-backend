import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import crypto from 'node:crypto';

const validKeyHex = crypto.randomBytes(32).toString('hex');
process.env.DEPOSIT_ACCOUNT_ENCRYPTION_KEY = validKeyHex;

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { decrypt } = await import('../../src/utils/encryption.js');
const { DepositAccountService, sanitizeDepositAccount } = await import(
  '../../src/services/deposit-account.service.js'
);

describe('DepositAccountService', () => {
  let mockHorizonServer: any;
  let service: InstanceType<typeof DepositAccountService>;

  beforeEach(() => {
    mockReset(prismaMock);
    mockHorizonServer = {
      loadAccount: jest.fn(),
    };
    service = new DepositAccountService(mockHorizonServer as any);
  });

  describe('createAccount', () => {
    it('generates a new keypair, encrypts secret seed, and persists to DB without returning secrets', async () => {
      const mockRecord = {
        id: 'acc-uuid-1',
        address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        encryptedSecret: 'iv:tag:ciphertext',
        invoiceId: null,
        inUse: false,
        lastUsedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      };

      prismaMock.depositAccount.create.mockImplementation(async (args: any) => ({
        ...mockRecord,
        address: args.data.address,
        encryptedSecret: args.data.encryptedSecret,
      }));

      const summary = await service.createAccount();

      expect(prismaMock.depositAccount.create).toHaveBeenCalledTimes(1);
      const createArgs = prismaMock.depositAccount.create.mock.calls[0][0];

      // Address should be a Stellar public key (starts with G and 56 chars long)
      expect(createArgs.data.address).toMatch(/^G[A-Z0-9]{55}$/);
      expect(createArgs.data.inUse).toBe(false);
      expect(createArgs.data.invoiceId).toBeNull();

      // Encrypted secret must be valid ciphertext decryptable into a Stellar secret key (starts with S)
      const decryptedSecret = decrypt(createArgs.data.encryptedSecret);
      expect(decryptedSecret).toMatch(/^S[A-Z0-9]{55}$/);

      // Returned summary must never include encrypted or raw secret
      expect((summary as any).encryptedSecret).toBeUndefined();
      expect((summary as any).secret).toBeUndefined();
      expect(summary.address).toBe(createArgs.data.address);
      expect(summary.inUse).toBe(false);

      // No horizon on-chain transactions submitted
      expect(mockHorizonServer.loadAccount).not.toHaveBeenCalled();

      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'deposit_account.created',
          actorType: 'SYSTEM',
          actorLabel: 'system',
          targetType: 'DepositAccount',
          targetId: 'acc-uuid-1',
        }),
      });
    });
  });

  describe('getAllAccounts', () => {
    it('returns all deposit accounts without secrets', async () => {
      const mockAccounts = [
        {
          id: 'acc-1',
          address: 'GAAA1',
          encryptedSecret: 'enc-1',
          invoiceId: 'inv-1',
          inUse: true,
          lastUsedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'acc-2',
          address: 'GAAA2',
          encryptedSecret: 'enc-2',
          invoiceId: null,
          inUse: false,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      prismaMock.depositAccount.findMany.mockResolvedValue(mockAccounts);

      const result = await service.getAllAccounts();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(sanitizeDepositAccount(mockAccounts[0] as any));
      expect(result[1]).toEqual(sanitizeDepositAccount(mockAccounts[1] as any));
      expect((result[0] as any).encryptedSecret).toBeUndefined();
      expect((result[1] as any).encryptedSecret).toBeUndefined();
    });
  });

  describe('getAccountBalance', () => {
    it('returns balances when the account exists on-chain', async () => {
      const mockBalances = [
        { balance: '100.0000000', asset_type: 'native' },
        { balance: '50.0000000', asset_type: 'credit_alphanum4', asset_code: 'USDC' },
      ];
      mockHorizonServer.loadAccount.mockResolvedValue({ balances: mockBalances });

      const balances = await service.getAccountBalance('GAAA1');

      expect(balances).toEqual(mockBalances);
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledWith('GAAA1');
    });

    it('returns an empty array when the account is 404 (not yet created on-chain)', async () => {
      const notFoundError: any = new Error('Not Found');
      notFoundError.name = 'NotFoundError';
      notFoundError.response = { status: 404 };
      mockHorizonServer.loadAccount.mockRejectedValue(notFoundError);

      const balances = await service.getAccountBalance('GAAA_NEW');

      expect(balances).toEqual([]);
    });

    it('rethrows non-404 errors', async () => {
      const serverError = new Error('Horizon Internal Error');
      mockHorizonServer.loadAccount.mockRejectedValue(serverError);

      await expect(service.getAccountBalance('GAAA1')).rejects.toThrow('Horizon Internal Error');
    });
  });

  describe('getAvailableAccounts', () => {
    it('returns only available (inUse: false) accounts without secrets', async () => {
      const availableAccount = {
        id: 'acc-2',
        address: 'GAAA2',
        encryptedSecret: 'enc-2',
        invoiceId: null,
        inUse: false,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.depositAccount.findMany.mockResolvedValue([availableAccount]);

      const result = await service.getAvailableAccounts();

      expect(prismaMock.depositAccount.findMany).toHaveBeenCalledWith({
        where: { inUse: false },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('acc-2');
      expect((result[0] as any).encryptedSecret).toBeUndefined();
    });
  });

  describe('assignAccount', () => {
    it('assigns an available account using conditional update', async () => {
      const candidate = {
        id: 'acc-1',
        address: 'GAAA1',
        encryptedSecret: 'enc-1',
        invoiceId: null,
        inUse: false,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedAccount = {
        ...candidate,
        inUse: true,
        invoiceId: 'inv-100',
        lastUsedAt: new Date(),
      };

      prismaMock.depositAccount.findMany.mockResolvedValue([candidate]);
      prismaMock.depositAccount.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.depositAccount.findUnique.mockResolvedValue(updatedAccount);

      const result = await service.assignAccount('inv-100');

      expect(prismaMock.depositAccount.updateMany).toHaveBeenCalledWith({
        where: { id: 'acc-1', inUse: false },
        data: expect.objectContaining({
          inUse: true,
          invoiceId: 'inv-100',
        }),
      });
      expect(result.id).toBe('acc-1');
      expect(result.inUse).toBe(true);
      expect(result.invoiceId).toBe('inv-100');
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'deposit_account.assigned',
          actorType: 'SYSTEM',
          targetType: 'DepositAccount',
          targetId: 'acc-1',
          metadata: { invoiceId: 'inv-100' },
        }),
      });
    });

    it('handles race conditions by trying the next candidate if lost race', async () => {
      const candidate1 = { id: 'acc-1', address: 'GAAA1', inUse: false };
      const candidate2 = { id: 'acc-2', address: 'GAAA2', inUse: false };

      prismaMock.depositAccount.findMany.mockResolvedValue([candidate1, candidate2]);

      // Lost race for candidate1 (count: 0), won race for candidate2 (count: 1)
      prismaMock.depositAccount.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      const updatedCandidate2 = {
        ...candidate2,
        encryptedSecret: 'enc-2',
        invoiceId: 'inv-200',
        inUse: true,
        lastUsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.depositAccount.findUnique.mockResolvedValue(updatedCandidate2);

      const result = await service.assignAccount('inv-200');

      expect(prismaMock.depositAccount.updateMany).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('acc-2');
      expect(result.invoiceId).toBe('inv-200');
    });

    it('throws 404 when no available accounts exist', async () => {
      prismaMock.depositAccount.findMany.mockResolvedValue([]);

      await expect(service.assignAccount('inv-300')).rejects.toMatchObject({
        statusCode: 404,
        message: 'No available deposit accounts',
      });
    });
  });

  describe('releaseAccount', () => {
    it('clears invoiceId and inUse flag, updating lastUsedAt', async () => {
      const assignedAccount = {
        id: 'acc-1',
        address: 'GAAA1',
        encryptedSecret: 'enc-1',
        invoiceId: 'inv-100',
        inUse: true,
        lastUsedAt: new Date('2026-01-01'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const releasedAccount = {
        ...assignedAccount,
        invoiceId: null,
        inUse: false,
        lastUsedAt: new Date(),
      };

      prismaMock.depositAccount.findUnique.mockResolvedValue(assignedAccount);
      prismaMock.depositAccount.update.mockResolvedValue(releasedAccount);

      const result = await service.releaseAccount('acc-1');

      expect(prismaMock.depositAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: {
          invoiceId: null,
          inUse: false,
          lastUsedAt: expect.any(Date),
        },
      });
      expect(result.inUse).toBe(false);
      expect(result.invoiceId).toBeNull();
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'deposit_account.released',
          actorType: 'SYSTEM',
          targetType: 'DepositAccount',
          targetId: 'acc-1',
        }),
      });
    });

    it('throws 404 if account does not exist', async () => {
      prismaMock.depositAccount.findUnique.mockResolvedValue(null);

      await expect(service.releaseAccount('non-existent-id')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Deposit account not found',
      });
    });
  });
});
