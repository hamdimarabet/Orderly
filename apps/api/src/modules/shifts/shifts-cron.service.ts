import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ShiftsService } from './shifts.service';

@Injectable()
export class ShiftsCronService {
  private readonly logger = new Logger('ShiftsCron');

  constructor(private shifts: ShiftsService) {}

  // Every 5 minutes
  @Cron('0 */5 * * * *')
  async closeExpired() {
    try {
      const result = await this.shifts.autoCloseExpired();
      if (result.closed > 0) {
        this.logger.log(`${result.closed} pointages fermés automatiquement`);
      }
    } catch (e: any) {
      this.logger.error(`Auto-close failed: ${e?.message}`);
    }
  }
}