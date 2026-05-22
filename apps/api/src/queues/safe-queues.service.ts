import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, JobsOptions, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

import { createRedisConnection, isRedisDisabled } from './redis-connection';
import { RECORDING_QUEUE, TRANSCRIPT_QUEUE } from './queue.constants';
import {
  TranscriptAssemblyService,
  type TranscriptJobData,
} from './transcript-assembly.service';

type SafeQueueState = 'pending' | 'disabled' | 'unavailable' | 'ready';

interface DisabledJob<Data> {
  id: string;
  name: string;
  data: Data;
  queueDisabled: true;
}

interface QueueProxy<Data = unknown> {
  add(
    name: string,
    data: Data,
    opts?: JobsOptions,
  ): Promise<Job<Data> | DisabledJob<Data>>;
}

const QUEUE_NAMES = [TRANSCRIPT_QUEUE, RECORDING_QUEUE] as const;

@Injectable()
export class SafeQueuesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SafeQueuesService.name);
  private readonly proxies = new Map<string, QueueProxy>();
  private readonly queues = new Map<string, Queue>();
  private worker: Worker<TranscriptJobData> | null = null;
  private state: SafeQueueState = 'pending';
  private initPromise: Promise<void> | null = null;
  private unavailableWarningLogged = false;
  private disabledWarningLogged = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly transcriptAssembly: TranscriptAssemblyService,
  ) {
    for (const name of QUEUE_NAMES) {
      this.proxies.set(name, this.createProxy(name));
    }
  }

  onModuleInit(): Promise<void> {
    this.initPromise = this.initialize();
    return this.initPromise;
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeRedisResources();
  }

  getQueue<Data = unknown>(name: string): QueueProxy<Data> {
    const proxy = this.proxies.get(name);
    if (!proxy) {
      throw new Error(`Unknown queue: ${name}`);
    }
    return proxy as QueueProxy<Data>;
  }

  private async initialize(): Promise<void> {
    if (isRedisDisabled(this.config.get<string>('DISABLE_REDIS'))) {
      this.state = 'disabled';
      this.logger.warn('DISABLE_REDIS=true; BullMQ queues and workers are disabled');
      return;
    }

    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) {
      this.state = 'disabled';
      this.logger.warn('REDIS_URL is not configured; BullMQ queues and workers are disabled');
      return;
    }

    const ok = await this.preflightRedis(redisUrl);
    if (!ok) {
      this.state = 'unavailable';
      return;
    }

    try {
      for (const name of QUEUE_NAMES) {
        this.queues.set(
          name,
          new Queue(name, {
            connection: createRedisConnection(redisUrl),
          }),
        );
      }
      this.worker = new Worker<TranscriptJobData>(
        TRANSCRIPT_QUEUE,
        async (job) => {
          await this.delay(3_000);
          return this.transcriptAssembly.assemble(job.data);
        },
        {
          connection: createRedisConnection(redisUrl),
          concurrency: 1,
        },
      );
      this.worker.on('error', (error) => {
        void this.disableAfterRuntimeError(`BullMQ worker error: ${error.message}`);
      });
      this.state = 'ready';
      this.logger.log('BullMQ queues enabled after Redis preflight');
    } catch (error: unknown) {
      this.state = 'unavailable';
      this.logUnavailable(`BullMQ initialization failed: ${messageOf(error)}`);
      await this.closeRedisResources();
    }
  }

  private async preflightRedis(redisUrl: string): Promise<boolean> {
    const client = new Redis(
      createRedisConnection(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      }),
    );
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.ping();
      return true;
    } catch (error: unknown) {
      this.logUnavailable(
        `Redis preflight failed; BullMQ disabled for this process: ${messageOf(error)}`,
      );
      return false;
    } finally {
      client.disconnect();
    }
  }

  private createProxy<Data>(queueName: string): QueueProxy<Data> {
    return {
      add: (name, data, opts) => this.add(queueName, name, data, opts),
    };
  }

  private async add<Data>(
    queueName: string,
    name: string,
    data: Data,
    opts?: JobsOptions,
  ): Promise<Job<Data> | DisabledJob<Data>> {
    if (this.initPromise) {
      await this.initPromise;
    }

    const queue = this.queues.get(queueName);
    if (this.state !== 'ready' || !queue) {
      this.logQueueSkipped(queueName, name);
      return this.disabledJob(name, data);
    }

    try {
      return (await queue.add(name, data, opts)) as Job<Data>;
    } catch (error: unknown) {
      await this.disableAfterRuntimeError(
        `BullMQ add failed for ${queueName}/${name}: ${messageOf(error)}`,
      );
      return this.disabledJob(name, data);
    }
  }

  private async disableAfterRuntimeError(message: string): Promise<void> {
    if (this.state !== 'ready') {
      return;
    }
    this.state = 'unavailable';
    this.logUnavailable(`${message}; BullMQ disabled for this process`);
    await this.closeRedisResources();
  }

  private async closeRedisResources(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      try {
        await worker.close(true);
      } catch (error: unknown) {
        this.logger.warn(`BullMQ worker close failed: ${messageOf(error)}`);
      }
    }

    const queues = [...this.queues.values()];
    this.queues.clear();
    await Promise.all(
      queues.map(async (queue) => {
        try {
          await queue.close();
        } catch (error: unknown) {
          this.logger.warn(`BullMQ queue close failed: ${messageOf(error)}`);
        }
      }),
    );
  }

  private disabledJob<Data>(name: string, data: Data): DisabledJob<Data> {
    return {
      id: `disabled-${Date.now()}`,
      name,
      data,
      queueDisabled: true,
    };
  }

  private logQueueSkipped(queueName: string, jobName: string): void {
    const key = `${queueName}:${jobName}`;
    if (this.disabledWarningLogged.has(key)) {
      return;
    }
    this.disabledWarningLogged.add(key);
    this.logger.warn(
      `BullMQ is ${this.state}; skipped ${queueName} queue job "${jobName}"`,
    );
  }

  private logUnavailable(message: string): void {
    if (this.unavailableWarningLogged) {
      return;
    }
    this.unavailableWarningLogged = true;
    this.logger.warn(message);
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
