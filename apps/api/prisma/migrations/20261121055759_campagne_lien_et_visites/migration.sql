/*
  Warnings:

  - A unique constraint covering the columns `[trackingCode]` on the table `Campaign` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "linkUrl" TEXT,
ADD COLUMN     "trackingCode" TEXT,
ADD COLUMN     "visits" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_trackingCode_key" ON "Campaign"("trackingCode");
