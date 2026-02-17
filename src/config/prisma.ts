import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
    if (process.env.NODE_ENV === 'test') return {} as PrismaClient;
    return new PrismaClient();
};

declare global {
    var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;
