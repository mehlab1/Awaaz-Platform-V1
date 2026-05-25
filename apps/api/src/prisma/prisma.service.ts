import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly slowQueryThresholdMs = Number(
    process.env.API_SLOW_DB_QUERY_MS ?? '150',
  );
  private readonly repeatWindowMs = Number(
    process.env.API_REPEAT_DB_WINDOW_MS ?? '2000',
  );
  private readonly repeatThreshold = Number(
    process.env.API_REPEAT_DB_THRESHOLD ?? '8',
  );
  private readonly queryWindow = new Map<
    string,
    {
      windowStart: number;
      count: number;
    }
  >();

  constructor() {
    super({
      log: [{ emit: 'event', level: 'query' }],
    });
  }

  async onModuleInit(): Promise<void> {
    this.$on('query', (event) => {
      if (event.duration >= this.slowQueryThresholdMs) {
        this.logger.warn(
          `[slow-db] duration=${event.duration}ms target=${event.target ?? 'unknown'} query=${truncate(
            fingerprintSql(event.query),
            220,
          )}`,
        );
      }

      const now = Date.now();
      const key = fingerprintSql(event.query);
      const current = this.queryWindow.get(key);
      if (!current || now - current.windowStart > this.repeatWindowMs) {
        this.queryWindow.set(key, { windowStart: now, count: 1 });
        return;
      }

      current.count += 1;
      if (current.count === this.repeatThreshold) {
        this.logger.warn(
          `[repeat-db] count=${current.count} window=${this.repeatWindowMs}ms query=${truncate(
            key,
            220,
          )}`,
        );
      }
    });

    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

function fingerprintSql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
}
