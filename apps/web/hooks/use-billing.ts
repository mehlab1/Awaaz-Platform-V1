'use client';

import { useQuery } from '@tanstack/react-query';
import { useOrgContext } from '@/components/org-context';

export type ProviderCredentialMode = 'BYOK' | 'FINOVA_MANAGED';

export interface BillingReportFilters {
  dateFrom: string | null;
  dateTo: string | null;
  providerId: string | null;
  credentialMode: ProviderCredentialMode | null;
}

export interface BillingSummaryResponse {
  generatedAt: string;
  range: { dateFrom: string; dateTo: string };
  filters: BillingReportFilters;
  summary: {
    callCount: number;
    lineItemCount: number;
    baseCostUsd: number;
    markupCostUsd: number;
    totalCostUsd: number;
    baseCostUsdMicros: string;
    markupCostUsdMicros: string;
    totalCostUsdMicros: string;
  };
}

export interface BillingBreakdownItem {
  bucket: string;
  bucketLabel: string;
  callCount: number;
  lineItemCount: number;
  usageQuantity: number;
  baseCostUsdMicros: string;
  markupCostUsdMicros: string;
  totalCostUsdMicros: string;
  baseCostUsd: number;
  markupCostUsd: number;
  totalCostUsd: number;
}

export interface BillingBreakdownResponse {
  generatedAt: string;
  range: { dateFrom: string; dateTo: string };
  filters: BillingReportFilters;
  items: BillingBreakdownItem[];
}

export interface BillingRecentCallItem {
  callId: string;
  callStatus: string;
  direction: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  agent: { id: string; name: string } | null;
  fromNumber: string | null;
  toNumber: string | null;
  lineItemCount: number;
  baseCostUsd: number;
  markupCostUsd: number;
  totalCostUsd: number;
  baseCostUsdMicros: string;
  markupCostUsdMicros: string;
  totalCostUsdMicros: string;
  providers: string[];
  credentialModes: ProviderCredentialMode[];
  categories: string[];
}

export interface BillingRecentCallsResponse {
  generatedAt: string;
  range: { dateFrom: string; dateTo: string };
  filters: BillingReportFilters;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: BillingRecentCallItem[];
}

export interface UseBillingQueryOptions {
  dateFrom?: string;
  dateTo?: string;
  providerId?: string;
  credentialMode?: ProviderCredentialMode;
}

function buildQueryString(options?: UseBillingQueryOptions & { page?: number; limit?: number }) {
  if (!options) return '';
  const params = new URLSearchParams();
  if (options.dateFrom) params.append('dateFrom', options.dateFrom);
  if (options.dateTo) params.append('dateTo', options.dateTo);
  if (options.providerId) params.append('providerId', options.providerId);
  if (options.credentialMode) params.append('credentialMode', options.credentialMode);
  if (options.page) params.append('page', options.page.toString());
  if (options.limit) params.append('limit', options.limit.toString());
  const str = params.toString();
  return str ? `?${str}` : '';
}

export function useBilling(options: UseBillingQueryOptions = {}) {
  const { activeOrgId, apiCall } = useOrgContext();

  const fetchSummary = async () => {
    const res = await apiCall(`/api/v1/billing/summary${buildQueryString(options)}`);
    if (!res.ok) throw new Error('Failed to fetch summary');
    return res.json() as Promise<BillingSummaryResponse>;
  };

  const fetchProviderBreakdown = async () => {
    const res = await apiCall(`/api/v1/billing/provider-breakdown${buildQueryString(options)}`);
    if (!res.ok) throw new Error('Failed to fetch provider breakdown');
    return res.json() as Promise<BillingBreakdownResponse>;
  };

  const fetchCredentialModeBreakdown = async () => {
    const res = await apiCall(`/api/v1/billing/credential-mode-breakdown${buildQueryString(options)}`);
    if (!res.ok) throw new Error('Failed to fetch credential mode breakdown');
    return res.json() as Promise<BillingBreakdownResponse>;
  };

  const fetchUsageBreakdown = async () => {
    const res = await apiCall(`/api/v1/billing/usage-breakdown${buildQueryString(options)}`);
    if (!res.ok) throw new Error('Failed to fetch usage breakdown');
    return res.json() as Promise<BillingBreakdownResponse>;
  };

  const summary = useQuery({
    queryKey: ['billing', 'summary', activeOrgId, options],
    queryFn: fetchSummary,
    enabled: !!activeOrgId,
  });

  const providerBreakdown = useQuery({
    queryKey: ['billing', 'providerBreakdown', activeOrgId, options],
    queryFn: fetchProviderBreakdown,
    enabled: !!activeOrgId,
  });

  const credentialModeBreakdown = useQuery({
    queryKey: ['billing', 'credentialModeBreakdown', activeOrgId, options],
    queryFn: fetchCredentialModeBreakdown,
    enabled: !!activeOrgId,
  });

  const usageBreakdown = useQuery({
    queryKey: ['billing', 'usageBreakdown', activeOrgId, options],
    queryFn: fetchUsageBreakdown,
    enabled: !!activeOrgId,
  });

  return {
    summary,
    providerBreakdown,
    credentialModeBreakdown,
    usageBreakdown,
  };
}

export function useBillingRecentCalls(options: UseBillingQueryOptions & { page?: number; limit?: number } = {}) {
  const { activeOrgId, apiCall } = useOrgContext();

  const fetchRecentCalls = async () => {
    const res = await apiCall(`/api/v1/billing/recent-calls${buildQueryString(options)}`);
    if (!res.ok) throw new Error('Failed to fetch recent calls');
    return res.json() as Promise<BillingRecentCallsResponse>;
  };

  return useQuery({
    queryKey: ['billing', 'recentCalls', activeOrgId, options],
    queryFn: fetchRecentCalls,
    enabled: !!activeOrgId,
  });
}
