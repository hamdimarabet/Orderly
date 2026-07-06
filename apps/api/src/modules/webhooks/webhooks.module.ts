import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { ShopifyWebhook } from './shopify.webhook';

@Module({
  controllers: [WebhooksController],
  providers: [ShopifyWebhook],
})
export class WebhooksModule {}