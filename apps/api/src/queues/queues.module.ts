import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from '../prisma/prisma.module';
import { RECORDING_QUEUE, TRANSCRIPT_QUEUE } from './queue.constants';
import { createRedisConnection } from './redis-connection';
import { TranscriptProcessor } from './transcript.processor';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
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
  ],
  providers: [TranscriptProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
