import { Module } from '@nestjs/common';

import { QueuesModule } from '../queues/queues.module';
import { InternalAuthGuard } from './internal-auth.guard';
import { InternalController } from './internal.controller';
import { InternalService } from './internal.service';

@Module({
  imports: [QueuesModule],
  controllers: [InternalController],
  providers: [InternalAuthGuard, InternalService],
})
export class InternalModule {}
