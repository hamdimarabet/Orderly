/*
  Warnings:

  - You are about to drop the column `storeId` on the `Segment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Segment" DROP COLUMN "storeId",
ADD COLUMN     "storeIds" TEXT[];
