import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { RimeService } from './rime.service';
import { VoicesController } from './voices.controller';
import { VoicesService } from './voices.service';

@Module({
  imports: [StorageModule],
  controllers: [VoicesController],
  providers: [RimeService, VoicesService],
  exports: [RimeService, VoicesService],
})
export class VoicesModule {}
