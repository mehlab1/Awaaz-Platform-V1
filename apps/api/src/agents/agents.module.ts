import { Module } from '@nestjs/common';

import { LiveKitModule } from '../livekit/livekit.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [LiveKitModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
