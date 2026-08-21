-- AlterTable
-- `name` is required with no default in the schema. Nothing can have written an
-- Admin row before this migration (there is no self-registration endpoint and
-- the bootstrap script arrives with it), so the table is empty in practice —
-- but the add/drop-default pair keeps the migration safe for any dev database
-- that had a row hand-inserted, instead of failing on the NOT NULL.
ALTER TABLE "Admin" ADD COLUMN     "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Admin" ALTER COLUMN "name" DROP DEFAULT;

ALTER TABLE "Admin" ADD COLUMN     "createdBy" TEXT;

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
