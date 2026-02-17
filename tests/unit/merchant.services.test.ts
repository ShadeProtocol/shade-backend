import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

// Wait for the mock to be applied
const { default: prismaMock } = await import('../../src/config/prisma.js') as any;
const { createMerchant, getMerchant, listMerchants } = await import('../../src/services/merchant.services.js');

describe('Merchant Services', () => {
    beforeEach(() => {
        mockReset(prismaMock);
    });

    test('should create a new merchant', async () => {
        const merchantData = {
            merchantId: 1,
            address: '0x123',
            email: 'test@example.com'
        };

        const expectedMerchant = {
            id: 'uuid-1',
            ...merchantData,
            active: true,
            verified: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        prismaMock.merchant.create.mockResolvedValue(expectedMerchant);

        const result = await createMerchant(merchantData);

        expect(result).toEqual(expectedMerchant);
        expect(prismaMock.merchant.create).toHaveBeenCalledWith({
            data: merchantData,
        });
    });

    test('should get a merchant by merchantId', async () => {
        const expectedMerchant = {
            id: 'uuid-1',
            merchantId: 1,
            address: '0x123',
            email: 'test@example.com',
            active: true,
            verified: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        prismaMock.merchant.findUnique.mockResolvedValue(expectedMerchant);

        const result = await getMerchant(1);

        expect(result).toEqual(expectedMerchant);
        expect(prismaMock.merchant.findUnique).toHaveBeenCalledWith({
            where: { merchantId: 1 },
        });
    });

    test('should list merchants', async () => {
        const merchants = [
            { id: 'uuid-1', merchantId: 1, address: '0x1', email: '1@test.com', active: true, verified: false, createdAt: new Date(), updatedAt: new Date() },
            { id: 'uuid-2', merchantId: 2, address: '0x2', email: '2@test.com', active: true, verified: false, createdAt: new Date(), updatedAt: new Date() }
        ];

        prismaMock.merchant.findMany.mockResolvedValue(merchants);

        const result = await listMerchants(10, 0);

        expect(result).toEqual(merchants);
        expect(prismaMock.merchant.findMany).toHaveBeenCalledWith({
            take: 10,
            skip: 0,
        });
    });
});
