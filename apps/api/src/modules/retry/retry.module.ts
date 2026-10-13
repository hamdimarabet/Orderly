import { Module } from '@nestjs/common';
import { RetryService } from './retry.service';
import { RetryController } from './retry.controller';
import { RetryCronService } from './retry-cron.service';
import { DispatchModule } from '../dispatch/dispatch.module';

@Module({
  imports: [DispatchModule],
  providers: [RetryService, RetryCronService],
  controllers: [RetryController],
  exports: [RetryService],
})
export class RetryModule {}