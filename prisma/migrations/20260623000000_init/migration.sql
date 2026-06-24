-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'PARTIALLY_PAID', 'DRAFT');

-- CreateEnum
CREATE TYPE "InvoicePricingMode" AS ENUM ('FIXED_CRYPTO', 'FIXED_FIAT');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INVOICE_PAYMENT', 'SUBSCRIPTION_CHARGE');

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
    "address" TEXT NOT NULL,
    "account" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "businessName" TEXT,
    "category" TEXT,
    "description" TEXT,
    "logo" TEXT,
    "webhook" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "registered" BOOLEAN NOT NULL DEFAULT false,
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
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "paymentSlug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "amountPaid" BIGINT NOT NULL DEFAULT 0,
    "amountRefunded" BIGINT NOT NULL DEFAULT 0,
    "token" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "payer" TEXT,
    "email" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "pricingMode" "InvoicePricingMode" NOT NULL DEFAULT 'FIXED_CRYPTO',
    "fiatCurrency" TEXT,
    "fiatAmount" BIGINT,
    "fiatDecimals" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "datePaid" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantAnalytics" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "totalVolume" BIGINT NOT NULL DEFAULT 0,
    "totalFees" BIGINT NOT NULL DEFAULT 0,
    "transactionCount" BIGINT NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "planId" INTEGER NOT NULL,
    "merchantId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "interval" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "planId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastCharged" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "refId" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "token" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenAnalytics" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "totalVolume" BIGINT NOT NULL DEFAULT 0,
    "totalFees" BIGINT NOT NULL DEFAULT 0,
    "transactionCount" BIGINT NOT NULL DEFAULT 0,
    "uniqueMerchants" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "payer" TEXT,
    "sourceChain" TEXT NOT NULL,
    "destinationChain" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "destinationRecipient" TEXT NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BridgePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_address_key" ON "Admin"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_merchantId_key" ON "Merchant"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_address_key" ON "Merchant"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "AcceptedToken_token_key" ON "AcceptedToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceId_key" ON "Invoice"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentSlug_key" ON "Invoice"("paymentSlug");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantAnalytics_merchantId_token_key" ON "MerchantAnalytics"("merchantId", "token");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_planId_key" ON "SubscriptionPlan"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_subscriptionId_key" ON "Subscription"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenAnalytics_token_key" ON "TokenAnalytics"("token");

-- AddForeignKey
ALTER TABLE "AuthNonce" ADD CONSTRAINT "AuthNonce_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantAnalytics" ADD CONSTRAINT "MerchantAnalytics_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgePayment" ADD CONSTRAINT "BridgePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgePayment" ADD CONSTRAINT "BridgePayment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
