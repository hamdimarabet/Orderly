-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RetryConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "attemptsPerDay" INTEGER NOT NULL DEFAULT 3,
    "maxAttempts" INTEGER NOT NULL DEFAULT 9,
    "minGapMinutes" INTEGER NOT NULL DEFAULT 120,
    "cancelAfterMax" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetryConfig_storeId_key" ON "RetryConfig"("storeId");

-- CreateIndex
CREATE INDEX "Order_nextRetryAt_idx" ON "Order"("nextRetryAt");
