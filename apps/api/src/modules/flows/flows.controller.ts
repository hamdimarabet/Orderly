import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, UseGuards, SetMetadata,
  } from '@nestjs/common';
  import { FlowsService } from './flows.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @Controller('flows')
  export class FlowsController {
    constructor(private flows: FlowsService) {}
  
    @UseGuards(JwtAuthGuard)
    @Get()
    list(@Query('storeId') storeId?: string) {
      return this.flows.list(storeId);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get(':id')
    getOne(@Param('id') id: string) {
      return this.flows.getOne(id);
    }
  
    @UseGuards(JwtAuthGuard)
    @Post()
    create(@Body() body: any) {
      return this.flows.create(body);
    }
  
    @UseGuards(JwtAuthGuard)
    @Patch(':id')
    update(@Param('id') id: string, @Body() body: any) {
      return this.flows.update(id, body);
    }
  
    @UseGuards(JwtAuthGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
      return this.flows.remove(id);
    }
  
    @UseGuards(JwtAuthGuard)
    @Post(':id/test')
    test(@Param('id') id: string, @Body() body: any) {
      return this.flows.startRun(id, body ?? {});
    }
  
    @UseGuards(JwtAuthGuard)
    @Post('resume-due')
    resume() {
      return this.flows.resumeDueRuns();
    }
  }