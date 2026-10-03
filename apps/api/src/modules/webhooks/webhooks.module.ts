import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { ShopifyWebhook } from './shopify.webhook';
import { DispatchModule } from '../dispatch/dispatch.module';

@Module({
  imports: [DispatchModule],
  controllers: [WebhooksController],
  providers: [ShopifyWebhook],
})
export class WebhooksModule {}