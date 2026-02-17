import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import request from 'supertest';

// Wait for the mock to be applied
const { default: prismaMock } = await import('../../src/config/prisma.js') as any;
const { default: app } = await import('../../src/app.js');

describe('Merchant Routes', () => {
    beforeEach(() => {
        mockReset(prismaMock);
    });

    test('POST /api/v1/merchants should create a merchant', async () => {
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        prismaMock.merchant.create.mockResolvedValue(expectedMerchant as any);

        const response = await request(app)
            .post('/api/v1/merchants')
            .send(merchantData);

        expect(response.status).toBe(201);
        expect(response.body).toEqual(expectedMerchant);
    });

    test('GET /api/v1/merchants/:id should return a merchant', async () => {
        const expectedMerchant = {
            id: 'uuid-1',
            merchantId: 1,
            address: '0x123',
            email: 'test@example.com',
            active: true,
            verified: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        prismaMock.merchant.findUnique.mockResolvedValue(expectedMerchant as any);

        const response = await request(app).get('/api/v1/merchants/1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(expectedMerchant);
    });

    test('GET /api/v1/merchants should list merchants', async () => {
        const merchants = [
            { id: 'uuid-1', merchantId: 1, address: '0x1', email: '1', active: true, verified: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        ];

        prismaMock.merchant.findMany.mockResolvedValue(merchants as any);

        const response = await request(app).get('/api/v1/merchants?limit=10&offset=0');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(merchants);
    });
});
