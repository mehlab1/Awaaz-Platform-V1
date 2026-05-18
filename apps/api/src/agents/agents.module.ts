import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { LiveKitModule } from '../livekit/livekit.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [AuditModule, LiveKitModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
