import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { BordereauService } from './bordereau.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { BundlesModule } from '../bundles/bundles.module';
import { FlowsModule } from '../flows/flows.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { RetryModule } from '../retry/retry.module';

@Module({
  imports: [DeliveryModule, BundlesModule, FlowsModule, DispatchModule,RetryModule,],
  providers: [OrdersService, BordereauService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}