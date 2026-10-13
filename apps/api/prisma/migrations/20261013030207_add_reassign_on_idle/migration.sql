-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "assignedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RetryConfig" ADD COLUMN     "reassignAfterMin" INTEGER NOT NULL DEFAULT 0;
