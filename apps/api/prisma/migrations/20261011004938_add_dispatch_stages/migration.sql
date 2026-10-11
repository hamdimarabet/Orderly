/*
  Warnings:

  - A unique constraint covering the columns `[userId,stage]` on the table `AgentAvailability` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "AgentAvailability_userId_key";

-- AlterTable
ALTER TABLE "AgentAvailability" ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'CONFIRMATION';

-- AlterTable
ALTER TABLE "DispatchRule" ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'CONFIRMATION';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "prepAgentId" TEXT,
ADD COLUMN     "prepAgentName" TEXT,
ADD COLUMN     "scanAgentId" TEXT,
ADD COLUMN     "scanAgentName" TEXT;

-- CreateIndex
CREATE INDEX "AgentAvailability_stage_idx" ON "AgentAvailability"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAvailability_userId_stage_key" ON "AgentAvailability"("userId", "stage");
