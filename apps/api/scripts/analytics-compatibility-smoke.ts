import { ConfigService } from '@nestjs/config';

import { AnalyticsService } from '../src/analytics/analytics.service';
import { PrismaService } from '../src/prisma/prisma.service';

const COST_MONTHS = 12;

async function main(): Promise<void> {
  const prisma = new PrismaService();
  const analytics = new AnalyticsService(prisma, new ConfigService({ DISABLE_REDIS: 'true' }));

  try {
    await prisma.$connect();

    const organization = await prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    if (!organization) {
      throw new Error('No organization found for analytics compatibility smoke');
    }

    const costs = await analytics.costs(organization.id);
    const firstBucket = costs.buckets[0];
    if (!firstBucket) {
      throw new Error('Analytics costs returned no buckets');
    }

    for (const key of ['totalUsd', 'sttUsd', 'llmUsd', 'ttsUsd', 'telephonyUsd'] as const) {
      if (typeof firstBucket[key] !== 'number') {
        throw new Error(`Analytics bucket missing numeric field ${key}`);
      }
    }

    const manual = await prisma.$queryRaw<Array<{
      month: string;
      total_usd: unknown;
      stt_usd: unknown;
      llm_usd: unknown;
      tts_usd: unknown;
      telephony_usd: unknown;
    }>>`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', NOW() AT TIME ZONE 'UTC') - interval '11 months',
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
        WHERE c."organizationId" = ${organization.id}
          AND c."createdAt" >= date_trunc('month', NOW() AT TIME ZONE 'UTC') - interval '11 months'
          AND (
            c."fromNumber" = 'browser-preview'
            OR c."metadata"->>'source' = 'awaaz_browser_test_call'
            OR (
              (c."metadata"->>'isTest' IS NULL OR c."metadata"->>'isTest' != 'true')
              AND (c."metadata"->>'isTestCall' IS NULL OR c."metadata"->>'isTestCall' != 'true')
            )
          )
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

    if (costs.months !== COST_MONTHS) {
      throw new Error(`Expected ${COST_MONTHS} months but received ${costs.months}`);
    }

    if (manual.length !== costs.buckets.length) {
      throw new Error('Analytics costs bucket count does not match manual aggregation');
    }

    const compare = (left: number, right: unknown) =>
      Math.abs(left - Number(right)) < 0.000001;

    for (let index = 0; index < costs.buckets.length; index += 1) {
      const bucket = costs.buckets[index];
      const row = manual[index];
      if (!bucket || !row) {
        throw new Error(`Missing analytics bucket at index ${index}`);
      }
      if (bucket.month !== row.month) {
        throw new Error(`Analytics month mismatch at index ${index}: ${bucket.month} != ${row.month}`);
      }
      if (!compare(bucket.totalUsd, row.total_usd)) {
        throw new Error(`Analytics totalUsd diverged for ${bucket.month}`);
      }
      if (!compare(bucket.sttUsd, row.stt_usd)) {
        throw new Error(`Analytics sttUsd diverged for ${bucket.month}`);
      }
      if (!compare(bucket.llmUsd, row.llm_usd)) {
        throw new Error(`Analytics llmUsd diverged for ${bucket.month}`);
      }
      if (!compare(bucket.ttsUsd, row.tts_usd)) {
        throw new Error(`Analytics ttsUsd diverged for ${bucket.month}`);
      }
      if (!compare(bucket.telephonyUsd, row.telephony_usd)) {
        throw new Error(`Analytics telephonyUsd diverged for ${bucket.month}`);
      }
    }

    process.stdout.write(
      JSON.stringify(
        {
          organizationId: organization.id,
          organizationName: organization.name,
          costBucketKeys: Object.keys(firstBucket),
          bucketCount: costs.buckets.length,
          analyticsMonthRange: [costs.buckets[0]?.month, costs.buckets[costs.buckets.length - 1]?.month],
          status: 'ok',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});