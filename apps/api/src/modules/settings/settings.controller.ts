import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get('sms-senders')
  getSmsSenders() {
    return this.settings.getSmsSenders();
  }

  @Post('sms-senders')
  setSmsSenders(@Body() body: { senders: string[] }) {
    return this.settings.setSmsSenders(body.senders ?? []);
  }
}