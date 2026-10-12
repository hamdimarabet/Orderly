import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsCronService } from './shifts-cron.service';

@Module({
  providers: [ShiftsService, ShiftsCronService],
  controllers: [ShiftsController],
  exports: [ShiftsService],
})
export class ShiftsModule {}