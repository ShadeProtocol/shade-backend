-- CreateTable
CREATE TABLE "PlatformDailyStats" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalVolume" BIGINT NOT NULL DEFAULT 0,
    "totalFees" BIGINT NOT NULL DEFAULT 0,
    "transactionCount" BIGINT NOT NULL DEFAULT 0,
    "newInvoices" INTEGER NOT NULL DEFAULT 0,
    "newMerchants" INTEGER NOT NULL DEFAULT 0,
    "newSubscriptions" INTEGER NOT NULL DEFAULT 0,
    "newTickets" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformDailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformDailyStats_date_key" ON "PlatformDailyStats"("date");
