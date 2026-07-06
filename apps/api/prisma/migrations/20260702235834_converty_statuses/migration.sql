/*
  Warnings:

  - The values [NEW,PROCESSING,READY_TO_SHIP,SHIPPED,OUT_FOR_DELIVERY,DELIVERED,CANCELLED,RETURNED,ON_HOLD,CONFIRMATION_PENDING,CONFIRMED,RETURN_TO_DEPOT,RETURN_RECEIVED,RETURN_NOT_RECEIVED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('NOUVEAU', 'CONFIRMATION_EN_COURS', 'CONFIRME', 'EN_PREPARATION', 'EXPEDIE', 'EN_COURS_DE_LIVRAISON', 'LIVRE', 'PAYE', 'RETOUR', 'RETOUR_DEPOT', 'RETOUR_RECU', 'ANNULE');
ALTER TABLE "Order" ALTER COLUMN "orderStatus" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "orderStatus" TYPE "OrderStatus_new" USING ("orderStatus"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "orderStatus" SET DEFAULT 'NOUVEAU';
COMMIT;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "orderStatus" SET DEFAULT 'NOUVEAU';
