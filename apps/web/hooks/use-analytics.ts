'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';

import { useOrgContext } from '@/components/org-context';

const summarySchema = z.object({
  calls: z.number(),
  completedCalls: z.number(),
  failedCalls: z.number(),
  abandonedCalls: z.number(),
  durationSeconds: z.number(),
  minutes: z.number(),
  totalCostUsd: z.number(),
  avgDurationSeconds: z.number(),
  avgCostUsd: z.number(),
  successRate: z.number(),
});

const overviewSchema = z.object({
  generatedAt: z.string(),
  windows: z.object({
    today: summarySchema,
    last7Days: summarySchema,
    last30Days: summarySchema,
  }),
});

const trendBucketSchema = z.object({
  day: z.string(),
  calls: z.number(),
  completedCalls: z.number(),
  durationSeconds: z.number(),
  minutes: z.number(),
  totalCostUsd: z.number(),
});

const callsTrendSchema = z.object({
  generatedAt: z.string(),
  days: z.number(),
  buckets: z.array(trendBucketSchema),
});

const costBucketSchema = z.object({
  month: z.string(),
  totalUsd: z.number(),
  sttUsd: z.number(),
  llmUsd: z.number(),
  ttsUsd: z.number(),
  telephonyUsd: z.number(),
});

const costsSchema = z.object({
  generatedAt: z.string(),
  months: z.number(),
  buckets: z.array(costBucketSchema),
});

const latencySchema = z.object({
  generatedAt: z.string(),
  samples: z.number(),
  p50Ms: z.number().nullable(),
  p95Ms: z.number().nullable(),
  p99Ms: z.number().nullable(),
  avgMs: z.number(),
  maxMs: z.number(),
});

const agentSchema = z.object({
  agentId: z.string().nullable(),
  agentName: z.string().nullable(),
  calls: z.number(),
  completedCalls: z.number(),
  durationSeconds: z.number(),
  minutes: z.number(),
  totalCostUsd: z.number(),
});

const agentsSchema = z.object({
  generatedAt: z.string(),
  items: z.array(agentSchema),
});

const liveSchema = z.object({
  generatedAt: z.string(),
  activeCalls: z.number(),
});

export type AnalyticsOverview = z.infer<typeof overviewSchema>;
export type AnalyticsTrend = z.infer<typeof callsTrendSchema>;
export type AnalyticsCosts = z.infer<typeof costsSchema>;
export type AnalyticsLatency = z.infer<typeof latencySchema>;
export type AnalyticsAgents = z.infer<typeof agentsSchema>;
export type AnalyticsLive = z.infer<typeof liveSchema>;
export type AnalyticsSummary = z.infer<typeof summarySchema>;
export type TrendBucket = z.infer<typeof trendBucketSchema>;
export type CostBucket = z.infer<typeof costBucketSchema>;
export type AgentMetric = z.infer<typeof agentSchema>;

interface AnalyticsQueries {
  activeOrgId: string | undefined;
  overview: UseQueryResult<AnalyticsOverview, Error>;
  trend: UseQueryResult<AnalyticsTrend, Error>;
  costs: UseQueryResult<AnalyticsCosts, Error>;
  latency: UseQueryResult<AnalyticsLatency, Error>;
  agents: UseQueryResult<AnalyticsAgents, Error>;
  live: UseQueryResult<AnalyticsLive, Error>;
  isLoading: boolean;
  error: Error | null;
}

type ApiCall = (path: string, init?: RequestInit) => Promise<Response>;

export function useAnalytics(): AnalyticsQueries {
  const { activeOrgId, apiCall } = useOrgContext();
  const enabled = Boolean(activeOrgId);

  const overview = useAnalyticsQuery(
    activeOrgId,
    'overview',
    overviewSchema,
    apiCall,
    enabled,
    60_000,
  );
  const trend = useAnalyticsQuery(
    activeOrgId,
    'calls-trend',
    callsTrendSchema,
    apiCall,
    enabled,
    300_000,
  );
  const costs = useAnalyticsQuery(
    activeOrgId,
    'costs',
    costsSchema,
    apiCall,
    enabled,
    300_000,
  );
  const latency = useAnalyticsQuery(
    activeOrgId,
    'latency',
    latencySchema,
    apiCall,
    enabled,
    60_000,
  );
  const agents = useAnalyticsQuery(
    activeOrgId,
    'agents',
    agentsSchema,
    apiCall,
    enabled,
    60_000,
  );
  const live = useLiveAnalyticsQuery(activeOrgId, apiCall, enabled);

  return {
    activeOrgId,
    overview,
    trend,
    costs,
    latency,
    agents,
    live,
    isLoading: [overview, trend, costs, latency, agents, live].some(
      (query) => query.isLoading,
    ),
    error:
      [overview, trend, costs, latency, agents, live].find(
        (query) => query.error,
      )?.error ?? null,
  };
}

function useAnalyticsQuery<T extends z.ZodType>(
  organizationId: string | undefined,
  endpoint: string,
  schema: T,
  apiCall: ApiCall,
  enabled: boolean,
  staleTime: number,
): UseQueryResult<z.infer<T>, Error> {
  return useQuery({
    queryKey: ['analytics', endpoint, organizationId],
    enabled,
    staleTime,
    queryFn: () => fetchAnalytics(endpoint, schema, apiCall),
  });
}

function useLiveAnalyticsQuery(
  organizationId: string | undefined,
  apiCall: ApiCall,
  enabled: boolean,
): UseQueryResult<AnalyticsLive, Error> {
  return useQuery({
    queryKey: ['analytics', 'live', organizationId],
    enabled,
    refetchInterval: enabled ? 10_000 : false,
    queryFn: () => fetchAnalytics('live', liveSchema, apiCall),
  });
}

async function fetchAnalytics<T extends z.ZodType>(
  endpoint: string,
  schema: T,
  apiCall: ApiCall,
): Promise<z.infer<T>> {
  const res = await apiCall(`/api/v1/analytics/${endpoint}`, {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error(await responseMessage(res));
  }
  const data: unknown = await res.json();
  return schema.parse(data);
}

async function responseMessage(res: Response): Promise<string> {
  const text = await res.text();
  if (text.trim().length > 0) {
    return text;
  }
  return `Analytics request failed (${res.status})`;
}
