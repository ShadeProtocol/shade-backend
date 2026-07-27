import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
const prismaClientSingleton = () => {
    if (process.env.NODE_ENV === 'test')
        return {};
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    return new PrismaClient({ adapter });
};
const prisma = globalThis.prisma ?? prismaClientSingleton();
export default prisma;
if (process.env.NODE_ENV !== 'production')
    globalThis.prisma = prisma;
