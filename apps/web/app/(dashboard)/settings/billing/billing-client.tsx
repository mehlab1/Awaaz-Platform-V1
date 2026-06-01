'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  AlertCircle,
  Banknote,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  KeyRound,
  Loader2,
  Receipt,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CustomSelect } from '@/components/ui/custom-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type ProviderCredentialMode,
  useBilling,
  useBillingRecentCalls,
} from '@/hooks/use-billing';
import { useOrgContext } from '@/components/org-context';

export function BillingClient() {
  const { activeOrgId } = useOrgContext();
  const [dateRange, setDateRange] = useState<'30d' | '7d' | 'today'>('30d');
  const [providerId] = useState<string>('all');
  const [credentialMode, setCredentialMode] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Simple date range calculation
  const getDates = () => {
    const to = new Date();
    const from = new Date();
    if (dateRange === '30d') {
      from.setDate(to.getDate() - 30);
    } else if (dateRange === '7d') {
      from.setDate(to.getDate() - 7);
    } else {
      from.setDate(to.getDate());
    }
    return {
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
    };
  };

  const dates = getDates();
  
  const options = {
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    providerId: providerId === 'all' ? undefined : providerId,
    credentialMode: credentialMode === 'all' ? undefined : credentialMode as ProviderCredentialMode,
  };

  const { summary, providerBreakdown, credentialModeBreakdown, usageBreakdown, agentBreakdown } = useBilling(options);
  const recentCalls = useBillingRecentCalls({ ...options, page, limit: pageSize });

  if (!activeOrgId) {
    return <p className="text-sm text-muted-foreground">Select an organization first.</p>;
  }

  const isLoading = summary.isLoading || providerBreakdown.isLoading || credentialModeBreakdown.isLoading || usageBreakdown.isLoading || agentBreakdown.isLoading;
  const isError = summary.isError || providerBreakdown.isError || credentialModeBreakdown.isError || usageBreakdown.isError || agentBreakdown.isError;
  const isRecentCallsLoading = recentCalls.isLoading;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Receipt className="size-6 text-foreground" />
            Billing & Usage
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View your organization&apos;s usage costs and history.
          </p>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-muted/30 p-4 rounded-xl border border-border/50">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <CustomSelect
            value={dateRange}
            onValueChange={(val: string) => { setDateRange(val as '30d' | '7d' | 'today'); setPage(1); }}
            options={[
              { value: 'today', label: 'Today' },
              { value: '7d', label: 'Last 7 Days' },
              { value: '30d', label: 'Last 30 Days' },
            ]}
            placeholder="Date Range"
            buttonClassName="w-[140px] h-8 bg-background"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <CustomSelect
            value={credentialMode}
            onValueChange={(val) => { setCredentialMode(val); setPage(1); }}
            options={[
              { value: 'all', label: 'All Modes' },
              { value: 'FINOVA_MANAGED', label: 'Finova Managed' },
              { value: 'BYOK', label: 'BYOK' },
            ]}
            placeholder="Mode"
            buttonClassName="w-[160px] h-8 bg-background"
          />
        </div>
      </div>

      {isError ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">Failed to load billing data</p>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-8 animate-spin mb-4" />
          <p>Loading billing data...</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                <Banknote className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${summary.data?.summary?.totalCostUsd?.toFixed(4) || '0.0000'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Base: ${summary.data?.summary?.baseCostUsd?.toFixed(4) || '0.0000'} + Markup: ${summary.data?.summary?.markupCostUsd?.toFixed(4) || '0.0000'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary.data?.summary?.callCount.toLocaleString() || '0'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Billed in this period
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Line Items</CardTitle>
                <Filter className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary.data?.summary?.lineItemCount.toLocaleString() || '0'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Individual usage records
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* Cost by Agent */}
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Cost by Agent</CardTitle>
              </CardHeader>
              <CardContent>
                {agentBreakdown.data?.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data available.</p>
                ) : (
                  <div className="space-y-4">
                    {agentBreakdown.data?.items.slice(0, 5).map((item) => (
                      <div key={item.bucket} className="flex items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-medium leading-none">{item.bucketLabel}</p>
                          <p className="text-xs text-muted-foreground">{item.callCount} calls</p>
                        </div>
                        <div className="shrink-0 text-sm font-medium">
                          ${item.totalCostUsd.toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cost by Provider */}
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Cost by Provider</CardTitle>
              </CardHeader>
              <CardContent>
                {providerBreakdown.data?.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data available.</p>
                ) : (
                  <div className="space-y-4">
                    {providerBreakdown.data?.items.map((item) => (
                      <div key={item.bucket} className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium leading-none">{item.bucketLabel}</p>
                          <p className="text-xs text-muted-foreground">{item.callCount} calls</p>
                        </div>
                        <div className="font-medium text-sm">
                          ${item.totalCostUsd.toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cost by Credential Mode */}
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Cost by Mode</CardTitle>
              </CardHeader>
              <CardContent>
                {credentialModeBreakdown.data?.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data available.</p>
                ) : (
                  <div className="space-y-4">
                    {credentialModeBreakdown.data?.items.map((item) => (
                      <div key={item.bucket} className="flex items-center justify-between">
                        <div className="space-y-1 flex items-center gap-2">
                          {item.bucket === 'FINOVA_MANAGED' ? (
                            <Building2 className="size-4 text-blue-500" />
                          ) : (
                            <KeyRound className="size-4 text-amber-500" />
                          )}
                          <div>
                            <p className="text-sm font-medium leading-none">{item.bucketLabel}</p>
                            <p className="text-xs text-muted-foreground">{item.callCount} calls</p>
                          </div>
                        </div>
                        <div className="font-medium text-sm">
                          ${item.totalCostUsd.toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cost by Category */}
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Cost by Category</CardTitle>
              </CardHeader>
              <CardContent>
                {usageBreakdown.data?.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data available.</p>
                ) : (
                  <div className="space-y-4">
                    {usageBreakdown.data?.items.map((item) => (
                      <div key={item.bucket} className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium leading-none">{item.bucketLabel}</p>
                          <p className="text-xs text-muted-foreground">{item.usageQuantity.toLocaleString()} usage qty</p>
                        </div>
                        <div className="font-medium text-sm">
                          ${item.totalCostUsd.toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Billed Calls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Billed Calls</CardTitle>
              <CardDescription>
                Detailed breakdown of recent calls and their associated costs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isRecentCallsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : recentCalls.data?.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Receipt className="size-8 mb-2 opacity-50" />
                  <p>No billed calls found for this period.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Call Date</TableHead>
                          <TableHead>Agent</TableHead>
                          <TableHead>Call ID</TableHead>
                          <TableHead>Providers</TableHead>
                          <TableHead>Modes</TableHead>
                          <TableHead className="text-right">Base Cost</TableHead>
                          <TableHead className="text-right">Markup</TableHead>
                          <TableHead className="text-right font-semibold">Total Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentCalls.data?.items.map((call) => (
                          <TableRow key={call.callId}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(call.createdAt), 'MMM d, yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate">
                              {call.agent?.name ?? 'Unassigned'}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {call.callId}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {call.providers.map(p => (
                                  <Badge key={p} variant="secondary" className="text-[10px] uppercase">
                                    {p}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {call.credentialModes.map(m => (
                                  <Badge key={m} variant="outline" className="text-[10px]">
                                    {m === 'FINOVA_MANAGED' ? 'Managed' : 'BYOK'}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              ${call.baseCostUsd.toFixed(4)}
                            </TableCell>
                            <TableCell className="text-right">
                              ${call.markupCostUsd.toFixed(4)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              ${call.totalCostUsd.toFixed(4)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {(recentCalls.data?.totalPages || 0) > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Page {recentCalls.data?.page} of {recentCalls.data?.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          <ChevronLeft className="size-4 mr-1" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => p + 1)}
                          disabled={page >= (recentCalls.data?.totalPages || 1)}
                        >
                          Next
                          <ChevronRight className="size-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
