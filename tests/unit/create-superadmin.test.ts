import { beforeEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { parseArgs, createSuperadmin, BootstrapError } = await import(
  '../../scripts/create-superadmin.js'
);

// A real key, checked against the real StrKey — the point of the validation is
// that it rejects anything the network would.
const ADDRESS = 'GBNFW62V7GWGPVW6BGK4KZQEWHNB3JL7K4WZFVHP3DHJWKUYLOAQK5YY';
const NAME = 'Jane Doe';

describe('parseArgs', () => {
  test('reads --flag=value', () => {
    expect(parseArgs([`--address=${ADDRESS}`, `--name=${NAME}`])).toEqual({
      address: ADDRESS,
      name: NAME,
    });
  });

  test('reads --flag value', () => {
    expect(parseArgs(['--address', ADDRESS, '--name', NAME])).toEqual({
      address: ADDRESS,
      name: NAME,
    });
  });

  test('rejects an invalid Stellar address', () => {
    expect(() => parseArgs(['--address=GNOTAVALIDADDRESS', `--name=${NAME}`])).toThrow(
      BootstrapError,
    );
  });

  test('rejects a well-formed address with a bad checksum', () => {
    const corrupted = `${ADDRESS.slice(0, -1)}A`;

    expect(() => parseArgs([`--address=${corrupted}`, `--name=${NAME}`])).toThrow(BootstrapError);
  });

  test.each([
    ['no address', [`--name=${NAME}`]],
    ['no name', [`--address=${ADDRESS}`]],
    ['blank name', [`--address=${ADDRESS}`, '--name=   ']],
    ['name flag swallowed by the next flag', ['--name', `--address=${ADDRESS}`]],
  ])('rejects %s', (_label, argv) => {
    expect(() => parseArgs(argv)).toThrow(BootstrapError);
  });
});

describe('createSuperadmin', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  test('creates an active superadmin with no creator', async () => {
    prismaMock.admin.findUnique.mockResolvedValue(null);
    prismaMock.admin.create.mockResolvedValue({ id: 'admin-uuid', address: ADDRESS, name: NAME });

    await createSuperadmin({ address: ADDRESS, name: NAME });

    expect(prismaMock.admin.create).toHaveBeenCalledWith({
      data: {
        address: ADDRESS,
        name: NAME,
        isSuperAdmin: true,
        active: true,
        createdBy: null,
      },
    });
  });

  test('refuses an address that already has an admin, without writing', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({
      id: 'existing-uuid',
      address: ADDRESS,
      isSuperAdmin: true,
    });

    await expect(createSuperadmin({ address: ADDRESS, name: NAME })).rejects.toThrow(
      BootstrapError,
    );
    expect(prismaMock.admin.create).not.toHaveBeenCalled();
  });

  test('refuses a duplicate even when the existing admin is not a superadmin', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({
      id: 'existing-uuid',
      address: ADDRESS,
      isSuperAdmin: false,
    });

    await expect(createSuperadmin({ address: ADDRESS, name: NAME })).rejects.toThrow(
      /Refusing to overwrite or duplicate/,
    );
    expect(prismaMock.admin.create).not.toHaveBeenCalled();
  });
});
