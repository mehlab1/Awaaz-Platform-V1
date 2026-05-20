import { Module } from '@nestjs/common';

import { QueuesModule } from '../queues/queues.module';
import { VoicesModule } from '../voices/voices.module';
import { InternalAuthGuard } from './internal-auth.guard';
import { InternalController } from './internal.controller';
import { InternalService } from './internal.service';

@Module({
  imports: [QueuesModule, VoicesModule],
  controllers: [InternalController],
  providers: [InternalAuthGuard, InternalService],
})
export class InternalModule {}
