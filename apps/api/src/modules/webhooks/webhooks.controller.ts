import {
    Controller,
    Post,
    Param,
    Body,
    Headers,
    Req,
    HttpCode,
    BadRequestException,
  } from '@nestjs/common';
  import { ShopifyWebhook } from './shopify.webhook';
  import * as crypto from 'crypto';
  
  @Controller('webhooks')
  export class WebhooksController {
    constructor(private shopify: ShopifyWebhook) {}
  
    @Post('shopify/:storeId/:topic')
    @HttpCode(200)
    async handleShopify(
      @Param('storeId') storeId: string,
      @Param('topic') topic: string,
      @Body() body: any,
      @Headers('x-shopify-hmac-sha256') hmac: string,
      @Req() req: any,
    ) {
      const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
      if (secret && hmac) {
        const raw = JSON.stringify(body);
        const hash = crypto
          .createHmac('sha256', secret)
          .update(raw)
          .digest('base64');
        if (hash !== hmac) throw new BadRequestException('Invalid HMAC');
      }
  
      switch (topic) {
        case 'orders-create':
          await this.shopify.handleOrderCreate(storeId, body);
          break;
        case 'orders-updated':
          await this.shopify.handleOrderUpdate(storeId, body);
          break;
        case 'orders-cancelled':
          await this.shopify.handleOrderCancelled(storeId, body);
          break;
        case 'fulfillments-create':
          await this.shopify.handleFulfillmentCreate(storeId, body);
          break;
        case 'refunds-create':
          await this.shopify.handleRefundCreate(storeId, body);
          break;
      }
  
      return { ok: true };
    }
  }