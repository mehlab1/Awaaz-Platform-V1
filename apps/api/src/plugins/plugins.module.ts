import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import {
  PluginCredentialsController,
  PluginsCatalogController,
} from './plugins.controller';
import { PluginsService } from './plugins.service';

@Module({
  imports: [AuditModule],
  controllers: [PluginsCatalogController, PluginCredentialsController],
  providers: [PluginsService],
  exports: [PluginsService],
})
export class PluginsModule {}
