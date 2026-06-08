import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { LiveKitModule } from '../livekit/livekit.module';
import { PluginsModule } from '../plugins/plugins.module';
import { VoicesModule } from '../voices/voices.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [AuditModule, LiveKitModule, VoicesModule, PluginsModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
