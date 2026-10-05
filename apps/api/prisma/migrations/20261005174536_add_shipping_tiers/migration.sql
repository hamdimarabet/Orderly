-- AlterTable
ALTER TABLE "ShippingRule" ADD COLUMN     "productRules" JSONB,
ADD COLUMN     "tiers" JSONB;
