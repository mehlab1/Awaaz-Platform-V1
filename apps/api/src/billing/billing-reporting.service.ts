import { Injectable } from '@nestjs/common';
import { ProviderCredentialMode, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  BillingRecentCallsQueryDto,
  BillingReportQueryDto,
} from './dto/billing-report.query.dto';

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

interface LedgerSummaryRow {
  call_count: unknown;
  line_item_count: unknown;
  base_cost_usd_micros: unknown;
  markup_cost_usd_micros: unknown;
  total_cost_usd_micros: unknown;
}

interface LedgerBreakdownRow {
  bucket: string;
  call_count: unknown;
  line_item_count: unknown;
  usage_quantity: unknown;
  base_cost_usd_micros: unknown;
  markup_cost_usd_micros: unknown;
  total_cost_usd_micros: unknown;
}

interface LedgerAgentBreakdownRow extends LedgerBreakdownRow {
  bucket_label: string;
}

interface RecentSnapshotRow {
  id: string;
  lineItemCount: number;
  totalBaseCostUsdMicros: bigint;
  totalMarkupUsdMicros: bigint;
  totalCostUsdMicros: bigint;
  createdAt: Date;
  metadata: unknown;
  lineItems: unknown;
  call: {
    id: string;
    status: string;
    direction: string;
    startedAt: Date | null;
    endedAt: Date | null;
    fromNumber: string | null;
    toNumber: string | null;
    agent: { id: string; name: string } | null;
  };
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

export interface BillingBreakdownResponseItem {
  bucket: string;
  bucketLabel: string;
  callCount: number;
  lineItemCount: number;
  usageQuantity: number;
  baseCostUsd: number;
  markupCostUsd: number;
  totalCostUsd: number;
  baseCostUsdMicros: string;
  markupCostUsdMicros: string;
  totalCostUsdMicros: string;
}

export interface BillingBreakdownResponse {
  generatedAt: string;
  range: { dateFrom: string; dateTo: string };
  filters: BillingReportFilters;
  items: BillingBreakdownResponseItem[];
}

export interface BillingRecentCallRow {
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
  items: BillingRecentCallRow[];
}

export interface BillingReportFilters {
  dateFrom: string | null;
  dateTo: string | null;
  providerId: string | null;
  credentialMode: ProviderCredentialMode | null;
}

interface ResolvedRange {
  dateFrom: string;
  dateTo: string;
  start: Date;
  endExclusive: Date;
}

@Injectable()
export class BillingReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    organizationId: string,
    query: BillingReportQueryDto,
  ): Promise<BillingSummaryResponse> {
    const range = resolveRange(query.dateFrom, query.dateTo);
    const filters = normalizeFilters(query);
    const rows = await this.prisma.$queryRaw<LedgerSummaryRow[]>`
      SELECT
        COUNT(DISTINCT ule."callId")::int AS call_count,
        COUNT(*)::int AS line_item_count,
        COALESCE(SUM(ule."baseCostUsdMicros"), 0)::text AS base_cost_usd_micros,
        COALESCE(SUM(ule."markupUsdMicros"), 0)::text AS markup_cost_usd_micros,
        COALESCE(SUM(ule."totalCostUsdMicros"), 0)::text AS total_cost_usd_micros
      FROM "usage_ledger_entries" ule
      WHERE ule."createdAt" >= ${range.start}
        AND ule."createdAt" < ${range.endExclusive}
        AND ule."organizationId" = ${organizationId}
        ${ledgerFilterSql(query.providerId, query.credentialMode)}
    `;

    const row = rows[0];
    return {
      generatedAt: new Date().toISOString(),
      range: { dateFrom: range.dateFrom, dateTo: range.dateTo },
      filters,
      summary: {
        callCount: toInt(row?.call_count),
        lineItemCount: toInt(row?.line_item_count),
        baseCostUsdMicros: toMicrosString(row?.base_cost_usd_micros),
        markupCostUsdMicros: toMicrosString(row?.markup_cost_usd_micros),
        totalCostUsdMicros: toMicrosString(row?.total_cost_usd_micros),
        baseCostUsd: microsToUsd(row?.base_cost_usd_micros),
        markupCostUsd: microsToUsd(row?.markup_cost_usd_micros),
        totalCostUsd: microsToUsd(row?.total_cost_usd_micros),
      },
    };
  }

  async usageBreakdown(
    organizationId: string,
    query: BillingReportQueryDto,
  ): Promise<BillingBreakdownResponse> {
    return this.breakdown(organizationId, query, 'usageMeter', (value) =>
      usageMeterLabel(value),
    );
  }

  async providerBreakdown(
    organizationId: string,
    query: BillingReportQueryDto,
  ): Promise<BillingBreakdownResponse> {
    return this.breakdown(organizationId, query, 'providerId', providerLabel);
  }

  async credentialModeBreakdown(
    organizationId: string,
    query: BillingReportQueryDto,
  ): Promise<BillingBreakdownResponse> {
    return this.breakdown(
      organizationId,
      query,
      'credentialMode',
      credentialModeLabel,
    );
  }

  async agentBreakdown(
    organizationId: string,
    query: BillingReportQueryDto,
  ): Promise<BillingBreakdownResponse> {
    const range = resolveRange(query.dateFrom, query.dateTo);
    const filters = normalizeFilters(query);
    const rows = await this.prisma.$queryRaw<LedgerAgentBreakdownRow[]>`
      SELECT
        COALESCE(c."agentId", 'unassigned') AS bucket,
        COALESCE(a."name", 'Unassigned') AS bucket_label,
        COUNT(DISTINCT ule."callId")::int AS call_count,
        COUNT(*)::int AS line_item_count,
        COALESCE(SUM(ule."usageQuantity"), 0)::text AS usage_quantity,
        COALESCE(SUM(ule."baseCostUsdMicros"), 0)::text AS base_cost_usd_micros,
        COALESCE(SUM(ule."markupUsdMicros"), 0)::text AS markup_cost_usd_micros,
        COALESCE(SUM(ule."totalCostUsdMicros"), 0)::text AS total_cost_usd_micros
      FROM "usage_ledger_entries" ule
      INNER JOIN "calls" c ON c."id" = ule."callId"
      LEFT JOIN "agents" a ON a."id" = c."agentId"
      WHERE ule."createdAt" >= ${range.start}
        AND ule."createdAt" < ${range.endExclusive}
        AND ule."organizationId" = ${organizationId}
        ${ledgerFilterSql(query.providerId, query.credentialMode)}
      GROUP BY 1, 2
      ORDER BY SUM(ule."totalCostUsdMicros") DESC, 2 ASC
    `;

    return {
      generatedAt: new Date().toISOString(),
      range: { dateFrom: range.dateFrom, dateTo: range.dateTo },
      filters,
      items: rows.map((row) => ({
        bucket: row.bucket,
        bucketLabel: row.bucket_label,
        callCount: toInt(row.call_count),
        lineItemCount: toInt(row.line_item_count),
        usageQuantity: toNumber(row.usage_quantity),
        baseCostUsdMicros: toMicrosString(row.base_cost_usd_micros),
        markupCostUsdMicros: toMicrosString(row.markup_cost_usd_micros),
        totalCostUsdMicros: toMicrosString(row.total_cost_usd_micros),
        baseCostUsd: microsToUsd(row.base_cost_usd_micros),
        markupCostUsd: microsToUsd(row.markup_cost_usd_micros),
        totalCostUsd: microsToUsd(row.total_cost_usd_micros),
      })),
    };
  }

  async recentCalls(
    organizationId: string,
    query: BillingRecentCallsQueryDto,
  ): Promise<BillingRecentCallsResponse> {
    const range = resolveRange(query.dateFrom, query.dateTo);
    const filters = normalizeFilters(query);
    const page = Math.max(1, query.page ?? DEFAULT_PAGE);
    const pageSize = Math.min(100, Math.max(1, query.limit ?? DEFAULT_LIMIT));
    const where = recentCallWhere(
      organizationId,
      range,
      query.providerId,
      query.credentialMode,
    );

    const [rows, total] = await Promise.all([
      this.prisma.callBillingSnapshot.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          call: {
            select: {
              id: true,
              status: true,
              direction: true,
              startedAt: true,
              endedAt: true,
              fromNumber: true,
              toNumber: true,
              agent: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.callBillingSnapshot.count({ where }),
    ]);

    const items = rows.map((row) => {
      const parsedLineItems = parseLineItems(row.lineItems);
      return {
        callId: row.call.id,
        callStatus: row.call.status,
        direction: row.call.direction,
        startedAt: row.call.startedAt?.toISOString() ?? null,
        endedAt: row.call.endedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        agent: row.call.agent,
        fromNumber: row.call.fromNumber,
        toNumber: row.call.toNumber,
        lineItemCount: row.lineItemCount,
        baseCostUsdMicros: row.totalBaseCostUsdMicros.toString(),
        markupCostUsdMicros: row.totalMarkupUsdMicros.toString(),
        totalCostUsdMicros: row.totalCostUsdMicros.toString(),
        baseCostUsd: microsToUsd(row.totalBaseCostUsdMicros),
        markupCostUsd: microsToUsd(row.totalMarkupUsdMicros),
        totalCostUsd: microsToUsd(row.totalCostUsdMicros),
        providers: unique(parsedLineItems.map((item) => item.providerId)),
        credentialModes: unique(
          parsedLineItems.map((item) => item.credentialMode),
        ) as ProviderCredentialMode[],
        categories: unique(parsedLineItems.map((item) => item.source)),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      range: { dateFrom: range.dateFrom, dateTo: range.dateTo },
      filters,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    };
  }

  private async breakdown(
    organizationId: string,
    query: BillingReportQueryDto,
    bucketColumn: 'usageMeter' | 'providerId' | 'credentialMode',
    labeler: (bucket: string) => string,
  ): Promise<BillingBreakdownResponse> {
    const range = resolveRange(query.dateFrom, query.dateTo);
    const filters = normalizeFilters(query);
    const rows = await this.prisma.$queryRaw<LedgerBreakdownRow[]>`
      SELECT
        ${Prisma.raw(`ule."${bucketColumn}"`)} AS bucket,
        COUNT(DISTINCT ule."callId")::int AS call_count,
        COUNT(*)::int AS line_item_count,
        COALESCE(SUM(ule."usageQuantity"), 0)::text AS usage_quantity,
        COALESCE(SUM(ule."baseCostUsdMicros"), 0)::text AS base_cost_usd_micros,
        COALESCE(SUM(ule."markupUsdMicros"), 0)::text AS markup_cost_usd_micros,
        COALESCE(SUM(ule."totalCostUsdMicros"), 0)::text AS total_cost_usd_micros
      FROM "usage_ledger_entries" ule
      WHERE ule."createdAt" >= ${range.start}
        AND ule."createdAt" < ${range.endExclusive}
        AND ule."organizationId" = ${organizationId}
        ${ledgerFilterSql(query.providerId, query.credentialMode)}
      GROUP BY 1
      ORDER BY SUM(ule."totalCostUsdMicros") DESC, 1 ASC
    `;

    return {
      generatedAt: new Date().toISOString(),
      range: { dateFrom: range.dateFrom, dateTo: range.dateTo },
      filters,
      items: rows.map((row) => ({
        bucket: row.bucket,
        bucketLabel: labeler(row.bucket),
        callCount: toInt(row.call_count),
        lineItemCount: toInt(row.line_item_count),
        usageQuantity: toNumber(row.usage_quantity),
        baseCostUsdMicros: toMicrosString(row.base_cost_usd_micros),
        markupCostUsdMicros: toMicrosString(row.markup_cost_usd_micros),
        totalCostUsdMicros: toMicrosString(row.total_cost_usd_micros),
        baseCostUsd: microsToUsd(row.base_cost_usd_micros),
        markupCostUsd: microsToUsd(row.markup_cost_usd_micros),
        totalCostUsd: microsToUsd(row.total_cost_usd_micros),
      })),
    };
  }
}

function ledgerFilterSql(
  providerId?: string,
  credentialMode?: ProviderCredentialMode,
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];
  if (providerId) {
    clauses.push(Prisma.sql`ule."providerId" = ${providerId}`);
  }
  if (credentialMode) {
    clauses.push(Prisma.sql`ule."credentialMode" = ${credentialMode}`);
  }
  if (clauses.length === 0) {
    return Prisma.empty;
  }
  return Prisma.sql`AND ${Prisma.join(clauses, ' AND ')}`;
}

function recentCallWhere(
  organizationId: string,
  range: ResolvedRange,
  providerId?: string,
  credentialMode?: ProviderCredentialMode,
): Prisma.CallBillingSnapshotWhereInput {
  const callFilter =
    providerId || credentialMode
      ? {
          usageLedgerEntries: {
            some: {
              ...(providerId ? { providerId } : {}),
              ...(credentialMode ? { credentialMode } : {}),
            },
          },
        }
      : undefined;

  return {
    organizationId,
    createdAt: {
      gte: range.start,
      lt: range.endExclusive,
    },
    ...(callFilter ? { call: callFilter } : {}),
  };
}

function resolveRange(dateFrom?: string, dateTo?: string): ResolvedRange {
  const today = utcStartOfDay(new Date());
  const resolvedEnd = dateTo ? parseYmd(dateTo) : today;
  const resolvedStart = dateFrom
    ? parseYmd(dateFrom)
    : addDaysUtc(resolvedEnd, -(DEFAULT_WINDOW_DAYS - 1));

  if (resolvedStart.getTime() > resolvedEnd.getTime()) {
    throw new Error('dateFrom must be on or before dateTo');
  }

  return {
    dateFrom: formatYmd(resolvedStart),
    dateTo: formatYmd(resolvedEnd),
    start: resolvedStart,
    endExclusive: addDaysUtc(resolvedEnd, 1),
  };
}

function normalizeFilters(
  query: BillingReportQueryDto,
): BillingReportFilters {
  return {
    dateFrom: query.dateFrom ?? null,
    dateTo: query.dateTo ?? null,
    providerId: query.providerId ?? null,
    credentialMode: query.credentialMode ?? null,
  };
}

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseYmd(value: string): Date {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toInt(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
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

function microsToUsd(value: unknown): number {
  return Number((toNumber(value) / 1_000_000).toFixed(6));
}

function toMicrosString(value: unknown): string {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return '0';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function parseLineItems(value: unknown): Array<{
  source: string;
  providerId: string;
  credentialMode: ProviderCredentialMode;
}> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      source: String(row.source ?? 'unknown'),
      providerId: String(row.providerId ?? 'unknown'),
      credentialMode: (row.credentialMode as ProviderCredentialMode) ?? 'FINOVA_MANAGED',
    };
  });
}

function providerLabel(providerId: string): string {
  const labels: Record<string, string> = {
    deepgram: 'Deepgram',
    groq: 'Groq',
    rime: 'Rime',
    twilio: 'Twilio',
    cartesia: 'Cartesia',
    elevenlabs: 'ElevenLabs',
    inworld: 'Inworld',
  };
  return labels[providerId] ?? titleCase(providerId);
}

function usageMeterLabel(value: string): string {
  const labels: Record<string, string> = {
    MINUTE: 'Minutes',
    TOKEN: 'Tokens',
    CHARACTER: 'Characters',
    REQUEST: 'Requests',
  };
  return labels[value] ?? titleCase(value);
}

function credentialModeLabel(value: string): string {
  return value === 'BYOK' ? 'BYOK' : 'Finova-managed';
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
