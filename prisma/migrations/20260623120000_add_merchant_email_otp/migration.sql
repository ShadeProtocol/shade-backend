-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN "emailOtp" TEXT,
ADD COLUMN "emailOtpExpiresAt" TIMESTAMP(3);
