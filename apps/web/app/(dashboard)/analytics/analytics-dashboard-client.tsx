'use client';

import { useState } from 'react';

import {
  type AgentMetric,
  type AnalyticsSummary,
  type CostBucket,
  type TrendBucket,
  useAnalytics,
} from '@/hooks/use-analytics';

import {
  ChartCard,
  HealthSection,
  PageHeader,
  PageMessage,
  RangeToggle,
  StatGrid,
  type TrendRange,
} from './analytics-cards';
import {
  CostBreakdownChart,
  EmptyChart,
  MonthlyCostChart,
  TopAgentsChart,
  TrendChart,
} from './analytics-charts';
import { formatUsd } from './analytics-format';

const EMPTY_SUMMARY: AnalyticsSummary = {
  calls: 0,
  completedCalls: 0,
  failedCalls: 0,
  abandonedCalls: 0,
  durationSeconds: 0,
  minutes: 0,
  totalCostUsd: 0,
  avgDurationSeconds: 0,
  avgCostUsd: 0,
  successRate: 0,
};

export function AnalyticsDashboardClient() {
  const analytics = useAnalytics();
  const [trendRange, setTrendRange] = useState<TrendRange>('7d');
  const today = analytics.overview.data?.windows.today ?? EMPTY_SUMMARY;
  const last30Days = analytics.overview.data?.windows.last30Days ?? EMPTY_SUMMARY;
  const trendBuckets = analytics.trend.data?.buckets;
  const costBuckets = analytics.costs.data?.buckets ?? [];
  const agents = analytics.agents.data?.items ?? [];
  const visibleTrend = selectTrendRange(trendBuckets ?? [], trendRange);

  if (!analytics.activeOrgId) {
    return <PageMessage title="Analytics" message="Select an organization." />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        isLoading={analytics.isLoading}
        errorMessage={analytics.error?.message ?? null}
      />
      <StatGrid today={today} />
      <TrendSection
        data={visibleTrend}
        range={trendRange}
        onRangeChange={setTrendRange}
      />
      <CostAndAgentsSection costBuckets={costBuckets} agents={agents} />
      <HealthSection
        summary={last30Days}
        liveCalls={analytics.live.data?.activeCalls ?? 0}
        liveGeneratedAt={analytics.live.data?.generatedAt}
        latency={analytics.latency.data}
      />
    </div>
  );
}

function TrendSection({
  data,
  range,
  onRangeChange,
}: {
  data: TrendBucket[];
  range: TrendRange;
  onRangeChange: (value: TrendRange) => void;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <ChartCard
        title="Calls Over Time"
        action={<RangeToggle value={range} onChange={onRangeChange} />}
      >
        {trendContent(data, 'calls')}
      </ChartCard>
      <ChartCard title="Minutes Over Time">
        {trendContent(data, 'minutes')}
      </ChartCard>
    </section>
  );
}

function CostAndAgentsSection({
  costBuckets,
  agents,
}: {
  costBuckets: CostBucket[];
  agents: AgentMetric[];
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <ChartCard title="Cost Breakdown" description={formatUsd(totalCost(costBuckets))}>
        {costContent(costBuckets)}
      </ChartCard>
      <ChartCard title="Top Agents" description="By call volume">
        {agents.length > 0 ? (
          <TopAgentsChart data={agents} />
        ) : (
          <EmptyChart label="No agent calls yet" />
        )}
      </ChartCard>
    </section>
  );
}

function trendContent(data: TrendBucket[], metric: 'calls' | 'minutes') {
  if (data.length === 0) {
    return <EmptyChart label={metric === 'calls' ? 'No calls yet' : 'No minutes yet'} />;
  }
  return <TrendChart data={data} metric={metric} />;
}

function costContent(costBuckets: CostBucket[]) {
  if (!costBuckets.some(hasBreakdownCost)) {
    return <EmptyChart label="No cost data yet" />;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <CostBreakdownChart data={costBuckets} />
      <MonthlyCostChart data={costBuckets} />
    </div>
  );
}

function selectTrendRange(data: TrendBucket[], range: TrendRange): TrendBucket[] {
  return range === '7d' ? data.slice(-7) : data;
}

function totalCost(data: CostBucket[]): number {
  return data.reduce((sum, row) => sum + row.totalUsd, 0);
}

function hasBreakdownCost(row: CostBucket): boolean {
  return row.sttUsd + row.llmUsd + row.ttsUsd + row.telephonyUsd > 0;
}
