import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(key: string) {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: any) {
    return this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  async getSmsSenders(): Promise<string[]> {
    const value = await this.get('sms_senders');
    return Array.isArray(value) ? (value as string[]) : [];
  }

  async setSmsSenders(senders: string[]) {
    const clean = senders.map((s) => s.trim()).filter(Boolean);
    await this.set('sms_senders', clean);
    return { ok: true, senders: clean };
  }
}