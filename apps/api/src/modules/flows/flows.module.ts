import { Module } from '@nestjs/common';
import { FlowsService } from './flows.service';
import { FlowsController } from './flows.controller';

@Module({
  providers: [FlowsService],
  controllers: [FlowsController],
  exports: [FlowsService],
})
export class FlowsModule {}