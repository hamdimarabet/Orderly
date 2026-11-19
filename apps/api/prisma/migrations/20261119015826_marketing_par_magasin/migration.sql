-- AlterTable
ALTER TABLE "AutomationFlow" ADD COLUMN     "storeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "recipients" JSONB,
ADD COLUMN     "storeId" TEXT;

-- CreateIndex
CREATE INDEX "Campaign_storeId_idx" ON "Campaign"("storeId");
