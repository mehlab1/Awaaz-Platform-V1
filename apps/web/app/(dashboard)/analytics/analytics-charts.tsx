'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  type AgentMetric,
  type CostBucket,
  type TrendBucket,
} from '@/hooks/use-analytics';

import {
  formatCompactNumber,
  formatMinutes,
  formatUsd,
  shortDay,
  shortMonth,
} from './analytics-format';

const COLORS = {
  calls: '#2563eb',
  minutes: '#16a34a',
  stt: '#0f766e',
  llm: '#7c3aed',
  tts: '#ea580c',
  telephony: '#be123c',
  agents: '#475569',
  grid: 'var(--border)',
  axis: 'var(--muted-foreground)',
};

interface TrendChartProps {
  data: TrendBucket[];
  metric: 'calls' | 'minutes';
}

interface CostBreakdownChartProps {
  data: CostBucket[];
}

interface TopAgentsChartProps {
  data: AgentMetric[];
}

export function TrendChart({ data, metric }: TrendChartProps) {
  const isCalls = metric === 'calls';
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tickLine={false}
          stroke={COLORS.axis}
        />
        <YAxis tickLine={false} stroke={COLORS.axis} />
        <Tooltip
          labelFormatter={(label) => shortDay(String(label))}
          formatter={(value) => formatTrendTooltip(value, metric)}
        />
        <Line
          type="monotone"
          dataKey={metric}
          name={isCalls ? 'Calls' : 'Minutes'}
          stroke={isCalls ? COLORS.calls : COLORS.minutes}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CostBreakdownChart({ data }: CostBreakdownChartProps) {
  const breakdown = costBreakdown(data);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={breakdown}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={92}
          paddingAngle={2}
        >
          {breakdown.map((item) => (
            <Cell key={item.name} fill={item.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatUsd(numberValue(value))} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TopAgentsChart({ data }: TopAgentsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={agentChartData(data)} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickLine={false}
          stroke={COLORS.axis}
          tickFormatter={formatCompactNumber}
        />
        <YAxis
          dataKey="agentName"
          type="category"
          tickLine={false}
          stroke={COLORS.axis}
          width={96}
        />
        <Tooltip formatter={(value) => `${formatCompactNumber(numberValue(value))} calls`} />
        <Bar dataKey="calls" name="Calls" fill={COLORS.agents} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function costBreakdown(data: CostBucket[]) {
  const totals = data.reduce(
    (acc, row) => ({
      stt: acc.stt + row.sttUsd,
      llm: acc.llm + row.llmUsd,
      tts: acc.tts + row.ttsUsd,
      telephony: acc.telephony + row.telephonyUsd,
    }),
    { stt: 0, llm: 0, tts: 0, telephony: 0 },
  );

  return [
    { name: 'STT', value: totals.stt, color: COLORS.stt },
    { name: 'LLM', value: totals.llm, color: COLORS.llm },
    { name: 'TTS', value: totals.tts, color: COLORS.tts },
    { name: 'Telephony', value: totals.telephony, color: COLORS.telephony },
  ].filter((item) => item.value > 0);
}

function agentChartData(data: AgentMetric[]) {
  return data.map((row) => ({
    ...row,
    agentName: row.agentName ?? 'Unknown',
  }));
}

function formatTrendTooltip(
  value: unknown,
  metric: TrendChartProps['metric'],
): string {
  const number = numberValue(value);
  return metric === 'minutes' ? formatMinutes(number) : formatCompactNumber(number);
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function MonthlyCostChart({ data }: { data: CostBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickFormatter={shortMonth}
          tickLine={false}
          stroke={COLORS.axis}
        />
        <YAxis
          tickLine={false}
          stroke={COLORS.axis}
          tickFormatter={(value) => formatCompactNumber(numberValue(value))}
        />
        <Tooltip
          labelFormatter={(label) => String(label)}
          formatter={(value) => formatUsd(numberValue(value))}
        />
        <Bar dataKey="sttUsd" name="STT" stackId="cost" fill={COLORS.stt} />
        <Bar dataKey="llmUsd" name="LLM" stackId="cost" fill={COLORS.llm} />
        <Bar dataKey="ttsUsd" name="TTS" stackId="cost" fill={COLORS.tts} />
        <Bar
          dataKey="telephonyUsd"
          name="Telephony"
          stackId="cost"
          fill={COLORS.telephony}
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
