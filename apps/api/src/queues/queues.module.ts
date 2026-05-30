import { Module, type Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';

import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RECORDING_QUEUE, TRANSCRIPT_QUEUE } from './queue.constants';
import { SafeQueuesService } from './safe-queues.service';
import { TranscriptAssemblyService } from './transcript-assembly.service';

const queueNames = [TRANSCRIPT_QUEUE, RECORDING_QUEUE];
const queueProviders = queueNames.map(createSafeQueueProvider);

@Module({
  imports: [ConfigModule, PrismaModule, BillingModule],
  providers: [TranscriptAssemblyService, SafeQueuesService, ...queueProviders],
  exports: [...queueNames.map(getQueueToken), TranscriptAssemblyService],
})
export class QueuesModule {}

function createSafeQueueProvider(name: string): Provider {
  return {
    provide: getQueueToken(name),
    inject: [SafeQueuesService],
    useFactory: (queues: SafeQueuesService) => queues.getQueue(name),
  };
}
