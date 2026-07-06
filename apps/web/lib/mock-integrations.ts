import { StoreIntegration, DeliveryIntegrationConfig } from "@/types/order";

export const MOCK_INTEGRATIONS: StoreIntegration[] = [
  {
    id: "int_1",
    storeId: "cmqyi9kek0000fptggxw19c4t",
    type: "SHOPIFY",
    status: "CONNECTED",
    label: "Shopify Admin API",
    config: { shopDomain: "meday.myshopify.com", apiVersion: "2025-10" },
    lastSyncAt: new Date().toISOString(),
  },
];

export const MOCK_DELIVERY_INTEGRATIONS: DeliveryIntegrationConfig[] = [
  {
    id: "del_1",
    storeId: "cmqyi9kek0000fptggxw19c4t",
    provider: "Not connected",
    status: "DISCONNECTED",
  },
];