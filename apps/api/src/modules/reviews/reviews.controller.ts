import {
    Controller, Get, Post, Body, Param, Query, UseGuards, SetMetadata,
  } from '@nestjs/common';
  import { ReviewsService } from './reviews.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @Controller('reviews')
  export class ReviewsController {
    constructor(private reviews: ReviewsService) {}
  
    @UseGuards(JwtAuthGuard)
    @Get()
    list(@Query('storeId') storeId?: string) {
      return this.reviews.list(storeId);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get('stats')
    stats(@Query('storeId') storeId?: string) {
      return this.reviews.stats(storeId);
    }
  
    // Public endpoints for the customer-facing form
    @SetMetadata('isPublic', true)
    @Get('public/:token')
    getByToken(@Param('token') token: string) {
      return this.reviews.getByToken(token);
    }
  
    @SetMetadata('isPublic', true)
    @Post('public/:token')
    submit(
      @Param('token') token: string,
      @Body() body: { rating: number; comment?: string },
    ) {
      return this.reviews.submit(token, body.rating, body.comment);
    }
  }