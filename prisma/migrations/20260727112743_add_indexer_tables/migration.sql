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
CREATE TABLE "IndexerCursor" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "lastLedger" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerEvent" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "ledger" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentConfirmation_idempotencyKey_key" ON "PaymentConfirmation"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "IndexerCursor_contractId_key" ON "IndexerCursor"("contractId");

-- AddForeignKey
ALTER TABLE "PaymentConfirmation" ADD CONSTRAINT "PaymentConfirmation_invoiceId_merchantId_fkey" FOREIGN KEY ("invoiceId", "merchantId") REFERENCES "Invoice"("id", "merchantId") ON DELETE RESTRICT ON UPDATE CASCADE;
