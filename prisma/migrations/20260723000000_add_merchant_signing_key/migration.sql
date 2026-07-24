-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN "merchantKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_merchantKey_key" ON "Merchant"("merchantKey");
