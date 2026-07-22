-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'A_VERIFIER';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerPhone2" TEXT,
ADD COLUMN     "deliveryCompany" TEXT,
ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "scheduledDeliveryDate" TIMESTAMP(3);
