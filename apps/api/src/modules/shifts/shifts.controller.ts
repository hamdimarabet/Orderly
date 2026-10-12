import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, UseGuards, Request,
  } from '@nestjs/common';
  import { ShiftsService } from './shifts.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @UseGuards(JwtAuthGuard)
  @Controller('shifts')
  export class ShiftsController {
    constructor(private shifts: ShiftsService) {}
  
    @Get()
    list() {
      return this.shifts.listShifts();
    }
  
    @Post()
    create(@Body() body: any) {
      return this.shifts.createShift(body);
    }
  
    @Patch(':id')
    update(@Param('id') id: string, @Body() body: any) {
      return this.shifts.updateShift(id, body);
    }
  
    @Delete(':id')
    remove(@Param('id') id: string) {
      return this.shifts.removeShift(id);
    }
  
    @Post('clock-in')
    clockIn(@Request() req: any) {
      return this.shifts.clockIn(req.user.id);
    }
  
    @Post('clock-out')
    clockOut(@Request() req: any) {
      return this.shifts.clockOut(req.user.id);
    }
  
    @Get('clock/status')
    status(@Request() req: any) {
      return this.shifts.getStatus(req.user.id);
    }
  
    @Get('clock/today')
    today() {
      return this.shifts.listToday();
    }
  
    @Post('clock/auto-close')
    autoClose() {
      return this.shifts.autoCloseExpired();
    }
  }