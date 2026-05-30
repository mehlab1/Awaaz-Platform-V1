import { Module } from '@nestjs/common';

import { LiveKitModule } from '../livekit/livekit.module';
import { PluginsModule } from '../plugins/plugins.module';
import { QueuesModule } from '../queues/queues.module';
import { VoicesModule } from '../voices/voices.module';
import { InternalAuthGuard } from './internal-auth.guard';
import { InternalController } from './internal.controller';
import { InternalService } from './internal.service';

@Module({
  imports: [LiveKitModule, PluginsModule, QueuesModule, VoicesModule],
  controllers: [InternalController],
  providers: [InternalAuthGuard, InternalService],
})
export class InternalModule {}
