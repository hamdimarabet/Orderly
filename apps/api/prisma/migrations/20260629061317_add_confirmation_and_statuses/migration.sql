-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'CONFIRMATION_PENDING';
ALTER TYPE "OrderStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "OrderStatus" ADD VALUE 'RETURN_TO_DEPOT';
ALTER TYPE "OrderStatus" ADD VALUE 'RETURN_RECEIVED';
ALTER TYPE "OrderStatus" ADD VALUE 'RETURN_NOT_RECEIVED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "callAttempts" JSONB,
ADD COLUMN     "cancellationNote" TEXT,
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "confirmationStatus" TEXT;
