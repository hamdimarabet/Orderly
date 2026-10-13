import {
    Controller, Get, Post, Body, Query, UseGuards,
  } from '@nestjs/common';
  import { RetryService } from './retry.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @UseGuards(JwtAuthGuard)
  @Controller('retry')
  export class RetryController {
    constructor(private retry: RetryService) {}
    @Post('reassign-idle')
  reassignIdle() {
    return this.retry.reassignIdle();
  }
    @Get('config')
    getConfig(@Query('storeId') storeId?: string) {
      return this.retry.getConfig(storeId);
    }
  
    @Post('config')
    saveConfig(@Body() body: any) {
      return this.retry.saveConfig(body);
    }
  
    @Post('process')
    process() {
      return this.retry.processDueRetries();
    }
  }