import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, UseGuards, Request,
  } from '@nestjs/common';
  import { CustomersService, CustomerFilters } from './customers.service';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  
  @UseGuards(JwtAuthGuard)
  @Controller('customers')
  export class CustomersController {
    constructor(private customers: CustomersService) {}
  
    // ---------- custom field definitions ----------
    // NOTE: these come first on purpose. '/fields' must be matched before '/:id'.
  
    @Get('fields')
    listFields(@Query('all') all?: string) {
      return this.customers.listFields(all !== 'true');
    }
  
    @Post('fields')
    createField(@Body() body: any) {
      return this.customers.createField(body);
    }
  
    @Patch('fields/:id')
    updateField(@Param('id') id: string, @Body() body: any) {
      return this.customers.updateField(id, body);
    }
  
    @Delete('fields/:id')
    deactivateField(@Param('id') id: string) {
      return this.customers.deactivateField(id);
    }
  
    // ---------- lists ----------
  
    @Get('stats')
    stats(@Query('storeIds') storeIds?: string) {
      return this.customers.stats(storeIds ? storeIds.split(',') : undefined);
    }
  
    @Get('worklist')
    worklist(@Query('storeIds') storeIds?: string) {
      return this.customers.worklist(storeIds ? storeIds.split(',') : undefined);
    }
  
    @Get('due')
    dueToday(@Query('storeIds') storeIds?: string, @Query('limit') limit?: string) {
      return this.customers.dueToday(
        storeIds ? storeIds.split(',') : undefined,
        limit ? parseInt(limit, 10) : 200,
      );
    }
  
    @Get('birthdays')
    birthdays(@Query('days') days?: string, @Query('storeIds') storeIds?: string) {
      return this.customers.birthdaysComing(
        days ? parseInt(days, 10) : 7,
        storeIds ? storeIds.split(',') : undefined,
      );
    }
  
    @Get('by-phone/:phone')
    byPhone(@Param('phone') phone: string) {
      return this.customers.getByPhone(phone);
    }
  
    @Get()
    list(@Query() q: any) {
      const num = (v: any) => (v === undefined || v === '' ? undefined : Number(v));
  
      // custom field filters arrive as  custom[skin_type]=grasse
      const custom: Record<string, string> = {};
      for (const [k, v] of Object.entries(q)) {
        const m = k.match(/^custom\[(.+)\]$/);
        if (m) custom[m[1]] = String(v);
      }
  
      const filters: CustomerFilters = {
        bucket: q.bucket,
        search: q.search,
        storeIds: q.storeIds ? String(q.storeIds).split(',') : undefined,
        tier: q.tier,
        city: q.city,
        minOrders: num(q.minOrders),
        maxOrders: num(q.maxOrders),
        minLtv: num(q.minLtv),
        maxLtv: num(q.maxLtv),
        maxReturnRate: num(q.maxReturnRate),
        minConfirmationRate: num(q.minConfirmationRate),
        lastOrderFrom: q.lastOrderFrom,
        lastOrderTo: q.lastOrderTo,
        dueOnly: q.dueOnly === 'true',
        birthdayMonth: num(q.birthdayMonth),
        birthdayInDays: num(q.birthdayInDays),
        custom: Object.keys(custom).length ? custom : undefined,
        sortBy: q.sortBy,
        page: num(q.page),
        pageSize: num(q.pageSize),
      };
  
      return this.customers.list(filters);
    }
  
    // ---------- one fiche ----------
  
    @Get(':id')
    getOne(@Param('id') id: string) {
      return this.customers.getOne(id);
    }
  
    @Patch(':id')
    update(@Param('id') id: string, @Body() body: any) {
      return this.customers.update(id, body);
    }
  
    @Post(':id/notes')
    addNote(@Param('id') id: string, @Body() body: { body: string; kind?: string }, @Request() req?: any) {
      return this.customers.addNote(
        id,
        body.body,
        { id: req?.user?.id, name: req?.user?.name },
        body.kind ?? 'NOTE',
      );
    }
  
    @Delete('notes/:noteId')
    deleteNote(@Param('noteId') noteId: string) {
      return this.customers.deleteNote(noteId);
    }
  
    @Post(':id/recompute')
    recompute(@Param('id') id: string) {
      return this.customers.recompute(id);
    }
  }