import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, UseGuards,
  } from '@nestjs/common';
  import { DispatchService } from './dispatch.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @UseGuards(JwtAuthGuard)
  @Controller('dispatch')
  export class DispatchController {
    constructor(private dispatch: DispatchService) {}
  
    @Get('agents')
    listAgents(
      @Query('stage') stage?: string,
      @Query('from') from?: string,
      @Query('to') to?: string,
    ) {
      return this.dispatch.listAgents(stage ?? 'CONFIRMATION', from, to);
    }

    @Patch('agents/:userId/availability')
    setAvailability(
      @Param('userId') userId: string,
      @Body() body: { isActive: boolean; stage?: string; note?: string },
    ) {
      return this.dispatch.setAvailability(
        userId,
        body.isActive,
        body.stage ?? 'CONFIRMATION',
        body.note,
      );
    }
    @Post('assign-bulk')
  assignBulk(@Body() body: { orderIds: string[]; userId: string }) {
    return this.dispatch.assignBulk(body.orderIds, body.userId);
  }
    @Post('rules')
    addRule(@Body() body: any) {
      return this.dispatch.addRule(body);
    }
  
    @Delete('rules/:id')
    removeRule(@Param('id') id: string) {
      return this.dispatch.removeRule(id);
    }
  
    @Post('run')
    run(@Body() body: { storeIds?: string[] }) {
      return this.dispatch.dispatchPending(body?.storeIds);
    }
  
    @Post('redistribute')
    redistribute() {
      return this.dispatch.redistributePending();
    }
  
    @Post('reassign/:orderId')
    reassign(@Param('orderId') orderId: string, @Body() body: { userId: string }) {
      return this.dispatch.reassign(orderId, body.userId);
    }
  }