-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "firstDeliveredAt" TIMESTAMP(3),
ADD COLUMN     "lastDeliveredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Customer_lastDeliveredAt_idx" ON "Customer"("lastDeliveredAt");
