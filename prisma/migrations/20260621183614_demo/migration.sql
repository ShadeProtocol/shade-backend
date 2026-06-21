-- CreateEnum
CREATE TYPE "Status" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "merchantId" INTEGER NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "address" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantId" TEXT,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcceptedToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcceptedToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantSession" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "token" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "payer" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "Status" NOT NULL,
    "datePaid" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_merchantId_key" ON "Merchant"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "AcceptedToken_token_key" ON "AcceptedToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantSession_token_key" ON "MerchantSession"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceId_key" ON "Invoice"("invoiceId");

-- AddForeignKey
ALTER TABLE "AuthNonce" ADD CONSTRAINT "AuthNonce_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSession" ADD CONSTRAINT "MerchantSession_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
