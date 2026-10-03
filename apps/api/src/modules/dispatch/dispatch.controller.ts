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
    listAgents() {
      return this.dispatch.listAgents();
    }
  
    @Patch('agents/:userId/availability')
    setAvailability(
      @Param('userId') userId: string,
      @Body() body: { isActive: boolean; note?: string },
    ) {
      return this.dispatch.setAvailability(userId, body.isActive, body.note);
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
  
    @Post('reassign/:orderId')
    reassign(@Param('orderId') orderId: string, @Body() body: { userId: string }) {
      return this.dispatch.reassign(orderId, body.userId);
    }
  }