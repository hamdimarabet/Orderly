import { Module } from '@nestjs/common';
import { FlowsService } from './flows.service';
import { FlowsController } from './flows.controller';
import { FlowsCronService } from './flows-cron.service';

@Module({
  providers: [FlowsService, FlowsCronService],
  controllers: [FlowsController],
  exports: [FlowsService],
})
export class FlowsModule {}