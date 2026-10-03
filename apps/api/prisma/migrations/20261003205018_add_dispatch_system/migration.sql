-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "packedById" TEXT,
ADD COLUMN     "packedByName" TEXT,
ADD COLUMN     "preparedById" TEXT,
ADD COLUMN     "preparedByName" TEXT,
ADD COLUMN     "scannedById" TEXT,
ADD COLUMN     "scannedByName" TEXT;

-- CreateTable
CREATE TABLE "DispatchRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT,
    "productSku" TEXT,
    "minTotal" DECIMAL(10,3),
    "maxTotal" DECIMAL(10,3),
    "city" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pausedAt" TIMESTAMP(3),
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DispatchRule_userId_idx" ON "DispatchRule"("userId");

-- CreateIndex
CREATE INDEX "DispatchRule_isActive_idx" ON "DispatchRule"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAvailability_userId_key" ON "AgentAvailability"("userId");

-- AddForeignKey
ALTER TABLE "DispatchRule" ADD CONSTRAINT "DispatchRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAvailability" ADD CONSTRAINT "AgentAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
