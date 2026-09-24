/*
  Warnings:

  - You are about to drop the column `channel` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `delayHours` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `lastRunAt` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `message` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `segmentId` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `totalSent` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `trigger` on the `Flow` table. All the data in the column will be lost.
  - Added the required column `edges` to the `Flow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nodes` to the `Flow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `triggerType` to the `Flow` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Flow" DROP CONSTRAINT "Flow_segmentId_fkey";

-- DropIndex
DROP INDEX "Flow_trigger_isActive_idx";

-- AlterTable
ALTER TABLE "Flow" DROP COLUMN "channel",
DROP COLUMN "delayHours",
DROP COLUMN "lastRunAt",
DROP COLUMN "message",
DROP COLUMN "segmentId",
DROP COLUMN "totalSent",
DROP COLUMN "trigger",
ADD COLUMN     "edges" JSONB NOT NULL,
ADD COLUMN     "nodes" JSONB NOT NULL,
ADD COLUMN     "stats" JSONB,
ADD COLUMN     "storeId" TEXT,
ADD COLUMN     "triggerType" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "AutomationFlow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL,
    "triggerConfig" JSONB,
    "segmentId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "message" TEXT NOT NULL,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowRun" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "orderId" TEXT,
    "customerPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "currentNode" TEXT,
    "context" JSONB,
    "resumeAt" TIMESTAMP(3),
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerName" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "token" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationFlow_trigger_isActive_idx" ON "AutomationFlow"("trigger", "isActive");

-- CreateIndex
CREATE INDEX "FlowRun_flowId_status_idx" ON "FlowRun"("flowId", "status");

-- CreateIndex
CREATE INDEX "FlowRun_status_resumeAt_idx" ON "FlowRun"("status", "resumeAt");

-- CreateIndex
CREATE INDEX "FlowRun_customerPhone_idx" ON "FlowRun"("customerPhone");

-- CreateIndex
CREATE INDEX "FlowLog_runId_createdAt_idx" ON "FlowLog"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_token_key" ON "Review"("token");

-- CreateIndex
CREATE INDEX "Review_storeId_rating_idx" ON "Review"("storeId", "rating");

-- CreateIndex
CREATE INDEX "Review_orderId_idx" ON "Review"("orderId");

-- CreateIndex
CREATE INDEX "Flow_storeId_isActive_idx" ON "Flow"("storeId", "isActive");

-- CreateIndex
CREATE INDEX "Flow_triggerType_isActive_idx" ON "Flow"("triggerType", "isActive");

-- AddForeignKey
ALTER TABLE "AutomationFlow" ADD CONSTRAINT "AutomationFlow_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowLog" ADD CONSTRAINT "FlowLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
