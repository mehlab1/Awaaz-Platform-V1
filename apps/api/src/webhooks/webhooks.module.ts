import { Module } from '@nestjs/common';

import { LiveKitModule } from '../livekit/livekit.module';
import { QueuesModule } from '../queues/queues.module';
import { LiveKitWebhooksService } from './livekit-webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [QueuesModule, LiveKitModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, LiveKitWebhooksService],
})
export class WebhooksModule {}
