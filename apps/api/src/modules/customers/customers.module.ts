import { Global, Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersSyncService } from './customers-sync.service';
import { CustomersController } from './customers.controller';

@Global()
@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomersSyncService],
  exports: [CustomersService],
})
export class CustomersModule {}