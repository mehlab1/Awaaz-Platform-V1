import { Logger, Module, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule, getQueueToken } from '@nestjs/bullmq';

import { PrismaModule } from '../prisma/prisma.module';
import { RECORDING_QUEUE, TRANSCRIPT_QUEUE } from './queue.constants';
import { createRedisConnection, isRedisDisabled } from './redis-connection';
import { TranscriptProcessor } from './transcript.processor';

const queuesDisabled = isRedisDisabled(process.env.DISABLE_REDIS);
const queueNames = [TRANSCRIPT_QUEUE, RECORDING_QUEUE];
const noopQueueProviders = queueNames.map(createNoopQueueProvider);
const bullQueueModules = [
  BullModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => {
      const redisUrl = config.get<string>('REDIS_URL');
      if (!redisUrl) {
        throw new Error('REDIS_URL is not configured');
      }
      return {
        connection: createRedisConnection(redisUrl),
      };
    },
  }),
  BullModule.registerQueue(
    { name: TRANSCRIPT_QUEUE },
    { name: RECORDING_QUEUE },
  ),
];

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ...(queuesDisabled ? [] : bullQueueModules),
  ],
  providers: queuesDisabled ? noopQueueProviders : [TranscriptProcessor],
  exports: queuesDisabled ? queueNames.map(getQueueToken) : [BullModule],
})
export class QueuesModule {}

function createNoopQueueProvider(name: string): Provider {
  const logger = new Logger(`Queue:${name}`);
  return {
    provide: getQueueToken(name),
    useValue: {
      async add(jobName: string, data: unknown) {
        logger.warn(
          `DISABLE_REDIS=true; skipped ${name} queue job "${jobName}"`,
        );
        return {
          id: `disabled-${Date.now()}`,
          name: jobName,
          data,
        };
      },
    },
  };
}
