'use client';

import { type ReactNode } from 'react';
import {
  Activity,
  Clock,
  DollarSign,
  PhoneCall,
  Radio,
  TrendingUp,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  type AnalyticsLatency,
  type AnalyticsSummary,
} from '@/hooks/use-analytics';
import { cn } from '@/lib/utils';

import {
  formatCompactNumber,
  formatInteger,
  formatMilliseconds,
  formatMinutes,
  formatPercent,
  formatUsd,
} from './analytics-format';

export type TrendRange = '7d' | '30d';

export function PageHeader({
  isLoading,
  errorMessage,
}: {
  isLoading: boolean;
  errorMessage: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Calls, costs, latency, and live activity.
        </p>
      </div>
      <div className="text-sm text-muted-foreground">
        {errorMessage ?? (isLoading ? 'Loading analytics...' : 'Updated')}
      </div>
    </div>
  );
}

export function StatGrid({ today }: { today: AnalyticsSummary }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<PhoneCall />} label="Total Calls Today" value={formatInteger(today.calls)} />
      <StatCard icon={<Clock />} label="Minutes Today" value={formatMinutes(today.minutes)} />
      <StatCard
        icon={<Activity />}
        label="Avg Duration"
        value={formatDuration(today.avgDurationSeconds)}
      />
      <StatCard icon={<DollarSign />} label="Avg Cost" value={formatUsd(today.avgCostUsd)} />
    </div>
  );
}

export function ChartCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] pb-4">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-6 pt-0">{children}</CardContent>
    </Card>
  );
}

export function RangeToggle({
  value,
  onChange,
}: {
  value: TrendRange;
  onChange: (value: TrendRange) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border p-0.5">
      {(['7d', '30d'] as const).map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={value === option ? 'secondary' : 'ghost'}
          className={cn('h-7 rounded-md px-3', value === option && 'shadow-sm')}
          onClick={() => onChange(option)}
        >
          {option.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}

export function HealthSection({
  summary,
  liveCalls,
  liveGeneratedAt,
  latency,
}: {
  summary: AnalyticsSummary;
  liveCalls: number;
  liveGeneratedAt: string | undefined;
  latency: AnalyticsLatency | undefined;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <LatencyCard latency={latency} />
      <SuccessRateCard summary={summary} />
      <LiveCard activeCalls={liveCalls} generatedAt={liveGeneratedAt} />
    </section>
  );
}

export function PageMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex size-12 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-3xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LatencyCard({ latency }: { latency: AnalyticsLatency | undefined }) {
  return (
    <MetricCard title="Latency" icon={<TrendingUp />}>
      <MetricRow label="P50" value={formatMilliseconds(latency?.p50Ms ?? null)} />
      <MetricRow label="P95" value={formatMilliseconds(latency?.p95Ms ?? null)} />
      <MetricRow label="P99" value={formatMilliseconds(latency?.p99Ms ?? null)} />
    </MetricCard>
  );
}

function SuccessRateCard({ summary }: { summary: AnalyticsSummary }) {
  return (
    <MetricCard title="Success Rate" icon={<Activity />}>
      <p className="text-3xl font-semibold tabular-nums">
        {formatPercent(summary.successRate)}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-600"
          style={{ width: `${Math.min(summary.successRate * 100, 100)}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {formatCompactNumber(summary.completedCalls)} completed of{' '}
        {formatCompactNumber(summary.calls)}
      </p>
    </MetricCard>
  );
}

function LiveCard({
  activeCalls,
  generatedAt,
}: {
  activeCalls: number;
  generatedAt: string | undefined;
}) {
  return (
    <MetricCard title="Live Calls" icon={<Radio />}>
      <p className="text-3xl font-semibold tabular-nums">
        {formatInteger(activeCalls)}
      </p>
      <p className="text-sm text-muted-foreground">
        {generatedAt ? `Refreshed ${formatClock(generatedAt)}` : 'Polling every 10s'}
      </p>
    </MetricCard>
  );
}

function MetricCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <CardTitle>{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${formatInteger(seconds)} sec`;
  }
  return formatMinutes(seconds / 60);
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
