-- CreateIndex
CREATE INDEX "Order_storeId_orderStatus_sourceCreatedAt_idx" ON "Order"("storeId", "orderStatus", "sourceCreatedAt");

-- CreateIndex
CREATE INDEX "Order_sourceCreatedAt_idx" ON "Order"("sourceCreatedAt");

-- CreateIndex
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");
