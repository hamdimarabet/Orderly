import { Module } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { MarketingController } from './marketing.controller';
import { OrdersModule } from '../orders/orders.module';
import { TrackController } from './track.controller';

@Module({
  imports: [OrdersModule],
  providers: [MarketingService],
  controllers: [MarketingController, TrackController],
})
export class MarketingModule {}