-- CreateTable
CREATE TABLE "PaymentConfirmation" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "payerAddress" TEXT NOT NULL,
    "txHash" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositAccount" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "invoiceId" TEXT,
    "inUse" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentConfirmation_idempotencyKey_key" ON "PaymentConfirmation"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAccount_address_key" ON "DepositAccount"("address");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAccount_invoiceId_key" ON "DepositAccount"("invoiceId");

-- AddForeignKey
ALTER TABLE "PaymentConfirmation" ADD CONSTRAINT "PaymentConfirmation_invoiceId_merchantId_fkey" FOREIGN KEY ("invoiceId", "merchantId") REFERENCES "Invoice"("id", "merchantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAccount" ADD CONSTRAINT "DepositAccount_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

