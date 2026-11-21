import { Controller, Post, Get, Body, Query, SetMetadata } from '@nestjs/common';
import { MarketingService } from './marketing.service';

/** Endpoint public appele par le pixel Shopify. Aucune donnee client. */
@Controller('track')
export class TrackController {
  constructor(private marketing: MarketingService) {}

  @Post('visit')
  @SetMetadata('isPublic', true)
  visit(@Body() body: { campaign?: string; c?: string }) {
    return this.marketing.trackVisit(body.campaign ?? body.c ?? '');
  }

  @Get('visit')
  @SetMetadata('isPublic', true)
  visitGet(@Query('c') c: string) {
    return this.marketing.trackVisit(c);
  }
}