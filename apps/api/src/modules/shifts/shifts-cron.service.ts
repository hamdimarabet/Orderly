import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ShiftsService } from './shifts.service';
import { DispatchService } from '../dispatch/dispatch.service';

@Injectable()
export class ShiftsCronService {
  private readonly logger = new Logger('ShiftsCron');

  constructor(
    private shifts: ShiftsService,
    private dispatch: DispatchService,
  ) {}

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
    // Every 5 minutes, split the backlog when a shift starts
    @Cron('0 */5 * * * *')
    async dispatchOnShiftStart() {
      try {
        const now = new Date();
        const day = now.getDay();
        const minutes = now.getHours() * 60 + now.getMinutes();
  
        const shifts = await this.shifts.listShifts();
  
        for (const s of shifts) {
          if (!s.isActive || !s.days.includes(day)) continue;
  
          const [h, m] = s.startTime.split(':').map(Number);
          const start = h * 60 + m;
  
          // Within 5 minutes after the shift started
          if (minutes >= start && minutes < start + 5) {
            const result = await this.dispatch.dispatchToShiftAgents(s.id);
            if (result.assigned) {
              this.logger.log(
                `${result.assigned} commandes réparties au début de ${s.name}`,
              );
            }
          }
        }
      } catch (e: any) {
        this.logger.error(`Shift dispatch failed: ${e?.message}`);
      }
    }
}