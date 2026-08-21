/**
 * Bootstraps the first superadmin.
 *
 * There is deliberately no admin self-registration endpoint — unlike merchants,
 * who provision themselves on first wallet sign-in, an Admin row can only be
 * created here or by an admin who already exists. This script is the only way
 * to get the first one, and it is intentionally CLI-only: no HTTP route
 * anywhere reaches this code.
 *
 *   npm run admin:create-superadmin -- --address=G... --name="Jane Doe"
 */
import { StrKey } from '@stellar/stellar-sdk';
import prisma from '../src/config/prisma.js';

export interface SuperadminInput {
  address: string;
  name: string;
}

/** A refusal the operator can act on, as opposed to an unexpected crash. */
export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapError';
    Object.setPrototypeOf(this, BootstrapError.prototype);
  }
}

const USAGE = 'Usage: npm run admin:create-superadmin -- --address=<G...> --name="<full name>"';

/**
 * Accepts both `--flag=value` and `--flag value`, since operators type these by
 * hand and both spellings are habitual.
 */
const readFlag = (argv: string[], flag: string): string | undefined => {
  const prefixed = argv.find(arg => arg.startsWith(`--${flag}=`));
  if (prefixed) {
    return prefixed.slice(`--${flag}=`.length);
  }

  const index = argv.indexOf(`--${flag}`);
  if (index !== -1) {
    const value = argv[index + 1];
    // `--name --address=G...` means the name was omitted, not that it is "--address=G...".
    return value?.startsWith('--') ? undefined : value;
  }

  return undefined;
};

export const parseArgs = (argv: string[]): SuperadminInput => {
  const address = readFlag(argv, 'address')?.trim();
  const name = readFlag(argv, 'name')?.trim();

  if (!address) {
    throw new BootstrapError(`--address is required.\n${USAGE}`);
  }

  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new BootstrapError(`"${address}" is not a valid Stellar public key.`);
  }

  if (!name) {
    throw new BootstrapError(`--name is required.\n${USAGE}`);
  }

  return { address, name };
};

/**
 * Refuses an address that already has an Admin row. Re-running with the same
 * address is an operator mistake worth surfacing — never an overwrite, and
 * never a silently swallowed no-op.
 */
export const createSuperadmin = async ({ address, name }: SuperadminInput) => {
  const existing = await prisma.admin.findUnique({ where: { address } });

  if (existing) {
    throw new BootstrapError(
      `An admin already exists for ${address} (id ${existing.id}, superadmin: ${existing.isSuperAdmin}). Refusing to overwrite or duplicate it.`,
    );
  }

  return prisma.admin.create({
    data: {
      address,
      name,
      isSuperAdmin: true,
      active: true,
      // The bootstrap admin has no creator; every later admin is created by one.
      createdBy: null,
    },
  });
};

const main = async (): Promise<void> => {
  const admin = await createSuperadmin(parseArgs(process.argv.slice(2)));

  console.log('Superadmin created:');
  console.log(`  id:      ${admin.id}`);
  console.log(`  address: ${admin.address}`);
  console.log(`  name:    ${admin.name}`);
};

// Only run when executed directly, so tests can import the pieces above.
if (process.argv[1]?.includes('create-superadmin')) {
  main()
    .catch((error: unknown) => {
      if (error instanceof BootstrapError) {
        console.error(error.message);
      } else {
        console.error('Failed to create superadmin:', error);
      }
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
