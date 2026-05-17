import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

@Module({
  imports: [StorageModule],
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}
