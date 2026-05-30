import { Module } from '@nestjs/common';

import { PluginsModule } from '../plugins/plugins.module';
import { StorageModule } from '../storage/storage.module';
import { ProviderVoiceCatalogService } from './provider-voice-catalog.service';
import { RimeService } from './rime.service';
import { VoicesController } from './voices.controller';
import { VoicesService } from './voices.service';

@Module({
  imports: [PluginsModule, StorageModule],
  controllers: [VoicesController],
  providers: [ProviderVoiceCatalogService, RimeService, VoicesService],
  exports: [RimeService, VoicesService],
})
export class VoicesModule {}
