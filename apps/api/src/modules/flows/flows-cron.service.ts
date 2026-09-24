import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FlowsService } from './flows.service';

@Injectable()
export class FlowsCronService {
  private readonly logger = new Logger('FlowsCron');
  private running = false;

  constructor(private flows: FlowsService) {}

  // Every minute
  @Cron('0 * * * * *')
  async resumeWaiting() {
    if (this.running) return;
    this.running = true;

    try {
      const result = await this.flows.resumeDueRuns();
      if (result.resumed > 0) {
        this.logger.log(`${result.resumed} flows repris`);
      }
    } catch (e: any) {
      this.logger.error(`Resume failed: ${e?.message}`);
    } finally {
      this.running = false;
    }
  }
}