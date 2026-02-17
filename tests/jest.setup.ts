import { jest } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';

// This is the most robust way to mock in Jest ESM
jest.unstable_mockModule('../src/config/prisma.js', () => {
    return {
        __esModule: true,
        default: mockDeep(),
    };
});

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
process.env.NODE_ENV = 'test';
