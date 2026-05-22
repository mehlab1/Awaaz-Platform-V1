import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';

import { PrismaService } from '../prisma/prisma.service';
import {
  createRedisConnection,
  isRedisDisabled,
} from '../queues/redis-connection';

const ANALYTICS_CACHE_VERSION = 'v2';
const OVERVIEW_TTL_SECONDS = 60;
const ONE_MINUTE_TTL_SECONDS = 60;
const TREND_DAYS = 30;
const COST_MONTHS = 12;

const ANALYTICS_CALL_SCOPE = Prisma.sql`
  AND (
    c."fromNumber" = 'browser-preview'
    OR c."metadata"->>'source' = 'awaaz_browser_test_call'
    OR (
      (c."metadata"->>'isTest' IS NULL OR c."metadata"->>'isTest' != 'true')
      AND (c."metadata"->>'isTestCall' IS NULL OR c."metadata"->>'isTestCall' != 'true')
    )
  )
`;

type OverviewWindowKey = 'today' | 'last7Days' | 'last30Days';

interface SummaryRow {
  calls: unknown;
  completed_calls: unknown;
  failed_calls: unknown;
  abandoned_calls: unknown;
  duration_seconds: unknown;
  total_cost_usd: unknown;
  avg_duration_seconds: unknown;
  avg_cost_usd: unknown;
}

interface TrendRow {
  day: string;
  calls: unknown;
  completed_calls: unknown;
  duration_seconds: unknown;
  total_cost_usd: unknown;
}

interface CostRow {
  month: string;
  total_usd: unknown;
  stt_usd: unknown;
  llm_usd: unknown;
  tts_usd: unknown;
  telephony_usd: unknown;
}

interface LatencyRow {
  samples: unknown;
  p50_ms: unknown;
  p95_ms: unknown;
  p99_ms: unknown;
  avg_ms: unknown;
  max_ms: unknown;
}

interface AgentRow {
  agent_id: string | null;
  agent_name: string | null;
  calls: unknown;
  completed_calls: unknown;
  duration_seconds: unknown;
  total_cost_usd: unknown;
}

interface LiveRow {
  active_calls: unknown;
}

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly redis: Redis | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const redisUrl = isRedisDisabled(config.get<string>('DISABLE_REDIS'))
      ? undefined
      : config.get<string>('REDIS_URL');
    this.redis = redisUrl ? new Redis(createCacheConnection(redisUrl)) : null;
    if (this.redis) {
      this.redis.on('error', (error) => {
        this.logger.warn(`Analytics cache unavailable: ${error.message}`);
      });
      this.redis.connect().catch((error: unknown) => {
        this.logger.warn(`Analytics cache connect failed: ${messageOf(error)}`);
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis?.quit();
    } catch (error: unknown) {
      this.logger.warn(`Analytics cache shutdown failed: ${messageOf(error)}`);
    }
  }

  async overview(organizationId: string) {
    return this.cached(
      organizationId,
      'overview',
      OVERVIEW_TTL_SECONDS,
      async () => {
        const now = new Date();
        const windows: Array<{
          key: OverviewWindowKey;
          from: Date;
        }> = [
          { key: 'today', from: utcStartOfDay(now) },
          { key: 'last7Days', from: daysAgoUtcStart(now, 6) },
          { key: 'last30Days', from: daysAgoUtcStart(now, 29) },
        ];

        const entries = await Promise.all(
          windows.map(async ({ key, from }) => {
            const rows = await this.prisma.$queryRaw<SummaryRow[]>`
              SELECT
                COUNT(*)::int AS calls,
                COUNT(*) FILTER (WHERE c."status" = 'COMPLETED'::"CallStatus")::int AS completed_calls,
                COUNT(*) FILTER (WHERE c."status" = 'FAILED'::"CallStatus")::int AS failed_calls,
                COUNT(*) FILTER (WHERE c."status" = 'ABANDONED'::"CallStatus")::int AS abandoned_calls,
                COALESCE(SUM(c."durationSeconds"), 0)::int AS duration_seconds,
                COALESCE(SUM(c."totalCostUsd"), 0)::double precision AS total_cost_usd,
                COALESCE(AVG(c."durationSeconds"), 0)::double precision AS avg_duration_seconds,
                COALESCE(AVG(c."totalCostUsd"), 0)::double precision AS avg_cost_usd
              FROM "calls" c
              WHERE c."organizationId" = ${organizationId}
                AND c."createdAt" >= ${from}
                ${ANALYTICS_CALL_SCOPE}
            `;
            return [key, summaryFromRow(rows[0])] as const;
          }),
        );

        return {
          generatedAt: new Date().toISOString(),
          windows: Object.fromEntries(entries) as Record<
            OverviewWindowKey,
            ReturnType<typeof summaryFromRow>
          >,
        };
      },
    );
  }

  async callsTrend(organizationId: string) {
    return this.cached(
      organizationId,
      'calls-trend',
      ONE_MINUTE_TTL_SECONDS,
      async () => {
        const start = daysAgoUtcStart(new Date(), TREND_DAYS - 1);
        const rows = await this.prisma.$queryRaw<TrendRow[]>`
          WITH days AS (
            SELECT generate_series(
              ${start}::timestamp,
              date_trunc('day', NOW() AT TIME ZONE 'UTC'),
              interval '1 day'
            ) AS day
          ),
          agg AS (
            SELECT
              date_trunc('day', c."createdAt") AS day,
              COUNT(*)::int AS calls,
              COUNT(*) FILTER (WHERE c."status" = 'COMPLETED'::"CallStatus")::int AS completed_calls,
              COALESCE(SUM(c."durationSeconds"), 0)::int AS duration_seconds,
              COALESCE(SUM(c."totalCostUsd"), 0)::double precision AS total_cost_usd
            FROM "calls" c
            WHERE c."organizationId" = ${organizationId}
              AND c."createdAt" >= ${start}
              ${ANALYTICS_CALL_SCOPE}
            GROUP BY 1
          )
          SELECT
            to_char(days.day, 'YYYY-MM-DD') AS day,
            COALESCE(agg.calls, 0)::int AS calls,
            COALESCE(agg.completed_calls, 0)::int AS completed_calls,
            COALESCE(agg.duration_seconds, 0)::int AS duration_seconds,
            COALESCE(agg.total_cost_usd, 0)::double precision AS total_cost_usd
          FROM days
          LEFT JOIN agg ON agg.day = days.day
          ORDER BY days.day ASC
        `;

        return {
          generatedAt: new Date().toISOString(),
          days: TREND_DAYS,
          buckets: rows.map((row) => ({
            day: row.day,
            calls: toInt(row.calls),
            completedCalls: toInt(row.completed_calls),
            durationSeconds: toInt(row.duration_seconds),
            minutes: secondsToMinutes(row.duration_seconds),
            totalCostUsd: roundUsd(row.total_cost_usd),
          })),
        };
      },
    );
  }

  async costs(organizationId: string) {
    return this.cached(
      organizationId,
      'costs',
      ONE_MINUTE_TTL_SECONDS,
      async () => {
        const start = utcStartOfMonth(new Date(), COST_MONTHS - 1);
        const rows = await this.prisma.$queryRaw<CostRow[]>`
          WITH months AS (
            SELECT generate_series(
              ${start}::timestamp,
              date_trunc('month', NOW() AT TIME ZONE 'UTC'),
              interval '1 month'
            ) AS month
          ),
          agg AS (
            SELECT
              date_trunc('month', c."createdAt") AS month,
              COALESCE(SUM(c."totalCostUsd"), 0)::double precision AS total_usd,
              COALESCE(SUM(NULLIF(c."costBreakdown"->>'sttUsd', '')::double precision), 0)::double precision AS stt_usd,
              COALESCE(SUM(NULLIF(c."costBreakdown"->>'llmUsd', '')::double precision), 0)::double precision AS llm_usd,
              COALESCE(SUM(NULLIF(c."costBreakdown"->>'ttsUsd', '')::double precision), 0)::double precision AS tts_usd,
              COALESCE(SUM(NULLIF(c."costBreakdown"->>'telephonyUsd', '')::double precision), 0)::double precision AS telephony_usd
            FROM "calls" c
            WHERE c."organizationId" = ${organizationId}
              AND c."createdAt" >= ${start}
              ${ANALYTICS_CALL_SCOPE}
            GROUP BY 1
          )
          SELECT
            to_char(months.month, 'YYYY-MM') AS month,
            COALESCE(agg.total_usd, 0)::double precision AS total_usd,
            COALESCE(agg.stt_usd, 0)::double precision AS stt_usd,
            COALESCE(agg.llm_usd, 0)::double precision AS llm_usd,
            COALESCE(agg.tts_usd, 0)::double precision AS tts_usd,
            COALESCE(agg.telephony_usd, 0)::double precision AS telephony_usd
          FROM months
          LEFT JOIN agg ON agg.month = months.month
          ORDER BY months.month ASC
        `;

        return {
          generatedAt: new Date().toISOString(),
          months: COST_MONTHS,
          buckets: rows.map((row) => ({
            month: row.month,
            totalUsd: roundUsd(row.total_usd),
            sttUsd: roundUsd(row.stt_usd),
            llmUsd: roundUsd(row.llm_usd),
            ttsUsd: roundUsd(row.tts_usd),
            telephonyUsd: roundUsd(row.telephony_usd),
          })),
        };
      },
    );
  }

  async latency(organizationId: string) {
    return this.cached(
      organizationId,
      'latency',
      ONE_MINUTE_TTL_SECONDS,
      async () => {
        const rows = await this.prisma.$queryRaw<LatencyRow[]>`
          SELECT
            COUNT(ce."latencyMs")::int AS samples,
            percentile_cont(0.50) WITHIN GROUP (ORDER BY ce."latencyMs")::double precision AS p50_ms,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY ce."latencyMs")::double precision AS p95_ms,
            percentile_cont(0.99) WITHIN GROUP (ORDER BY ce."latencyMs")::double precision AS p99_ms,
            COALESCE(AVG(ce."latencyMs"), 0)::double precision AS avg_ms,
            COALESCE(MAX(ce."latencyMs"), 0)::int AS max_ms
          FROM "call_events" ce
          INNER JOIN "calls" c ON c."id" = ce."callId"
          WHERE c."organizationId" = ${organizationId}
            AND ce."eventType" = 'AGENT_SPEECH'::"EventType"
            AND ce."latencyMs" IS NOT NULL
            ${ANALYTICS_CALL_SCOPE}
        `;

        const row = rows[0];
        return {
          generatedAt: new Date().toISOString(),
          samples: toInt(row?.samples),
          p50Ms: toNullableNumber(row?.p50_ms),
          p95Ms: toNullableNumber(row?.p95_ms),
          p99Ms: toNullableNumber(row?.p99_ms),
          avgMs: toNumber(row?.avg_ms),
          maxMs: toInt(row?.max_ms),
        };
      },
    );
  }

  async agents(organizationId: string) {
    return this.cached(
      organizationId,
      'agents',
      ONE_MINUTE_TTL_SECONDS,
      async () => {
        const rows = await this.prisma.$queryRaw<AgentRow[]>`
          SELECT
            a."id" AS agent_id,
            a."name" AS agent_name,
            COUNT(c."id")::int AS calls,
            COUNT(c."id") FILTER (WHERE c."status" = 'COMPLETED'::"CallStatus")::int AS completed_calls,
            COALESCE(SUM(c."durationSeconds"), 0)::int AS duration_seconds,
            COALESCE(SUM(c."totalCostUsd"), 0)::double precision AS total_cost_usd
          FROM "calls" c
          INNER JOIN "agents" a ON a."id" = c."agentId"
          WHERE c."organizationId" = ${organizationId}
            ${ANALYTICS_CALL_SCOPE}
          GROUP BY a."id", a."name"
          ORDER BY COUNT(c."id") DESC, a."name" ASC
          LIMIT 5
        `;

        return {
          generatedAt: new Date().toISOString(),
          items: rows.map((row) => ({
            agentId: row.agent_id,
            agentName: row.agent_name,
            calls: toInt(row.calls),
            completedCalls: toInt(row.completed_calls),
            durationSeconds: toInt(row.duration_seconds),
            minutes: secondsToMinutes(row.duration_seconds),
            totalCostUsd: roundUsd(row.total_cost_usd),
          })),
        };
      },
    );
  }

  async live(organizationId: string) {
    const rows = await this.prisma.$queryRaw<LiveRow[]>`
      SELECT COUNT(*)::int AS active_calls
      FROM "calls" c
      WHERE c."organizationId" = ${organizationId}
        AND c."status" = 'IN_PROGRESS'::"CallStatus"
        ${ANALYTICS_CALL_SCOPE}
    `;
    return {
      generatedAt: new Date().toISOString(),
      activeCalls: toInt(rows[0]?.active_calls),
    };
  }

  private async cached<T>(
    organizationId: string,
    name: string,
    ttlSeconds: number,
    compute: () => Promise<T>,
  ): Promise<T> {
    if (!this.redis || this.redis.status !== 'ready') {
      return compute();
    }

    const key = `analytics:${ANALYTICS_CACHE_VERSION}:${organizationId}:${name}`;
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (error: unknown) {
      this.logger.warn(`Analytics cache read failed: ${messageOf(error)}`);
    }

    const value = await compute();
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error: unknown) {
      this.logger.warn(`Analytics cache write failed: ${messageOf(error)}`);
    }
    return value;
  }
}

function summaryFromRow(row: SummaryRow | undefined) {
  const calls = toInt(row?.calls);
  const completedCalls = toInt(row?.completed_calls);
  const failedCalls = toInt(row?.failed_calls);
  const abandonedCalls = toInt(row?.abandoned_calls);
  return {
    calls,
    completedCalls,
    failedCalls,
    abandonedCalls,
    durationSeconds: toInt(row?.duration_seconds),
    minutes: secondsToMinutes(row?.duration_seconds),
    totalCostUsd: roundUsd(row?.total_cost_usd),
    avgDurationSeconds: toNumber(row?.avg_duration_seconds),
    avgCostUsd: roundUsd(row?.avg_cost_usd),
    successRate:
      calls > 0 ? roundRatio(completedCalls / calls) : 0,
  };
}

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
}

function daysAgoUtcStart(date: Date, daysAgo: number): Date {
  const start = utcStartOfDay(date);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  return start;
}

function utcStartOfMonth(date: Date, monthsAgo: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() - monthsAgo,
    1,
  ));
}

function toInt(value: unknown): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  return 0;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toNumber(value);
}

function secondsToMinutes(value: unknown): number {
  return Number((toNumber(value) / 60).toFixed(4));
}

function roundUsd(value: unknown): number {
  return Number(toNumber(value).toFixed(6));
}

function roundRatio(value: number): number {
  return Number(value.toFixed(4));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createCacheConnection(url: string): RedisOptions {
  return {
    ...createRedisConnection(url),
    connectTimeout: 1_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  };
}
