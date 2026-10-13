import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RetryService } from './retry.service';

@Injectable()
export class RetryCronService {
  private readonly logger = new Logger('RetryCron');
  private running = false;

  constructor(private retry: RetryService) {}

  // Every 10 minutes
  @Cron('0 */10 * * * *')
  async process() {
    if (this.running) return;
    this.running = true;

    try {
      const result = await this.retry.processDueRetries();
      if (result.requeued > 0 || result.cancelled > 0) {
        this.logger.log(
          `${result.requeued} relancées, ${result.cancelled} annulées`,
        );
      }
    } catch (e: any) {
      this.logger.error(`Retry failed: ${e?.message}`);
    } finally {
      this.running = false;
    }
  }
    // Every 15 minutes
    @Cron('0 */15 * * * *')
    async reassign() {
      try {
        const result = await this.retry.reassignIdle();
        if (result.moved && result.moved > 0) {
          this.logger.log(`${result.moved} commandes réassignées`);
        }
      } catch (e: any) {
        this.logger.error(`Reassign failed: ${e?.message}`);
      }
    }
}
