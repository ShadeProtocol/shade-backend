import type { Merchant, Admin } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      merchant?: Merchant;
      admin?: Admin;
    }
  }
}

export {};
