import { jest, beforeEach } from '@jest/globals';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

export const prismaMock = mockDeep<PrismaClient>();

jest.mock('../../src/config/prisma.js', () => ({
    __esModule: true,
    default: prismaMock,
}));

beforeEach(() => {
    mockReset(prismaMock);
});
