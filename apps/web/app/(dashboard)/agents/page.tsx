'use client';

import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { format } from 'date-fns';
import {
  Building2,
  Bot,
  Grid3X3,
  LayoutList,
  Mic,
  Phone,
  PhoneCall,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CreateOrganizationDialog } from '@/components/create-organization-dialog';
import { useOrgContext } from '@/components/org-context';
import { cn } from '@/lib/utils';
import {
  CreateAgentDialog,
  type CreateAgentInput,
} from './create-agent-dialog';

interface AgentListRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  assignedPhoneNumbers: string[];
  callsLast7Days: number;
  currentVersion: {
    id: string;
    voiceId: string;
    versionNumber: number;
    isLive: boolean;
    publishedAt: string | null;
  } | null;
}

interface CreatedAgent {
  id: string;
}

interface VoiceOption {
  id: string;
  rimeVoiceId: string;
  name: string;
}

type ViewMode = 'grid' | 'table';

const CREATE_AGENT_ROLES = new Set(['OWNER', 'ADMIN', 'BUILDER']);

const GRADIENT_PAIRS = [
  'from-violet-500/80 to-indigo-600/80',
  'from-sky-500/80 to-blue-600/80',
  'from-emerald-500/80 to-teal-600/80',
  'from-amber-500/80 to-orange-600/80',
  'from-rose-500/80 to-pink-600/80',
  'from-fuchsia-500/80 to-purple-600/80',
  'from-cyan-500/80 to-sky-600/80',
  'from-lime-500/80 to-green-600/80',
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENT_PAIRS[Math.abs(hash) % GRADIENT_PAIRS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().substring(0, 2).toUpperCase() || 'AG';
}

export default function AgentsPage() {
  const router = useRouter();
  const { isLoaded: authLoaded } = useAuth();
  const { activeOrgId, apiCall, loadingOrgs, orgs } = useOrgContext();
  const [agents, setAgents] = useState<AgentListRow[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const loadData = useCallback(async () => {
    if (!activeOrgId) {
      setAgents([]);
      setVoices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [agentsRes, voicesRes] = await Promise.all([
        apiCall('/api/v1/agents', { method: 'GET' }),
        apiCall('/api/v1/voices', { method: 'GET' }),
      ]);
      if (!agentsRes.ok) {
        throw new Error(await responseMessage(agentsRes));
      }
      if (!voicesRes.ok) {
        throw new Error(await responseMessage(voicesRes));
      }

      setAgents((await agentsRes.json()) as AgentListRow[]);
      setVoices((await voicesRes.json()) as VoiceOption[]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, apiCall]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeOrg = orgs.find((org) => org.id === activeOrgId);
  const organizationsReady = authLoaded && !loadingOrgs;
  const hasNoWorkspace =
    organizationsReady && !activeOrgId && orgs.length === 0;
  const showNoWorkspaceState = hasNoWorkspace && !loading;
  const canCreateAgent = CREATE_AGENT_ROLES.has(activeOrg?.role ?? '');
  const createAgentDisabledReason = hasNoWorkspace
    ? 'Create or join a workspace before creating an agent.'
    : undefined;

  const createAgent = async (input: CreateAgentInput) => {
    if (!activeOrgId) {
      throw new Error('Select an organization first.');
    }

    setCreating(true);
    setError(null);
    try {
      const agentRes = await apiCall('/api/v1/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          description: input.description || undefined,
        }),
      });
      if (!agentRes.ok) {
        throw new Error(await responseMessage(agentRes));
      }
      const agent = (await agentRes.json()) as CreatedAgent;

      router.push(`/agents/${agent.id}`);
    } finally {
      setCreating(false);
    }
  };

  const formatPhones = (nums: string[]) => {
    if (nums.length === 0) {
      return null;
    }
    if (nums.length === 1) {
      return nums[0];
    }
    return `${nums[0]} (+${nums.length - 1})`;
  };

  const resolveVoiceName = (voiceId: string | undefined): string | null => {
    if (!voiceId) return null;
    const found = voices.find((v) => v.rimeVoiceId === voiceId);
    return found?.name ?? voiceId;
  };

  return (
    <div className="space-y-8">
      {/* ─── PAGE HEADER ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="mt-2 max-w-xl text-muted-foreground text-sm leading-relaxed">
            Manage your AI voice agents. Each agent can be configured with a unique
            personality, voice, and phone number routing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          {!loading && agents.length > 0 && (
            <div className="flex rounded-lg border border-border/60 p-0.5 bg-muted/30">
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                className={cn(
                  'h-8 w-8 p-0 rounded-md transition-all',
                  viewMode === 'grid' && 'shadow-sm',
                )}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <Grid3X3 className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                className={cn(
                  'h-8 w-8 p-0 rounded-md transition-all',
                  viewMode === 'table' && 'shadow-sm',
                )}
                onClick={() => setViewMode('table')}
                title="Table view"
              >
                <LayoutList className="size-4" />
              </Button>
            </div>
          )}
          <CreateAgentDialog
            isBusy={creating}
            canCreate={canCreateAgent}
            disabledReason={createAgentDisabledReason}
            onSubmit={createAgent}
          />
        </div>
      </div>

      {/* ─── ERROR ─── */}
      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* ─── NO WORKSPACE ─── */}
      {showNoWorkspaceState ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/60 bg-muted/[0.02] px-8 py-20 text-center">
          <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm">
            <Building2 className="size-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            Create your workspace first
          </h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Create a workspace to manage agents, calls, phone numbers, and team
            members.
          </p>
          <div className="mt-6">
            <CreateOrganizationDialog
              buttonLabel="Create organization"
              buttonClassName="h-9 px-4"
            />
          </div>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Already part of a team? Ask an owner to invite you to an existing
            workspace.
          </p>
        </div>
      ) : null}

      {/* ─── LOADING SKELETON ─── */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/40 bg-card p-6 space-y-4 animate-pulse"
            >
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-full bg-muted" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-1/3 rounded bg-muted" />
                </div>
              </div>
              <div className="h-12 rounded-lg bg-muted" />
              <div className="h-8 rounded-lg bg-muted" />
            </div>
          ))}
        </div>
      ) : null}

      {/* ─── EMPTY STATE ─── */}
      {!loading && activeOrgId && agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/60 bg-muted/[0.02] py-20 px-8 text-center">
          <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-5 shadow-sm">
            <Sparkles className="size-7 text-primary/70" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            Create your first agent
          </h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
            Build an AI voice agent with custom instructions, a unique voice, and
            phone number routing to handle calls automatically.
          </p>
          <div className="mt-6">
            <CreateAgentDialog
              isBusy={creating}
              canCreate={canCreateAgent}
              disabledReason={createAgentDisabledReason}
              onSubmit={createAgent}
            />
          </div>
        </div>
      ) : null}

      {/* ─── GRID VIEW ─── */}
      {!loading && agents.length > 0 && viewMode === 'grid' ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((row) => {
            const edited = safeParseDate(row.updatedAt);
            const voiceName = resolveVoiceName(row.currentVersion?.voiceId);
            const phoneLabel = formatPhones(row.assignedPhoneNumbers);
            const initials = getInitials(row.name);
            const gradient = getGradient(row.name);

            return (
              <Link
                key={row.id}
                href={`/agents/${row.id}`}
                className="group relative rounded-2xl border border-border/40 bg-card hover:border-border/80 hover:shadow-lg hover:shadow-primary/[0.03] transition-all duration-300 overflow-hidden"
              >
                {/* Card Content */}
                <div className="p-6 space-y-4">
                  {/* Header with avatar */}
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'size-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0 transition-transform duration-300 group-hover:scale-105',
                        gradient,
                      )}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {row.name}
                        </h3>
                        <span className="relative flex h-2 w-2 shrink-0">
                          {row.isActive ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </>
                          ) : (
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-400" />
                          )}
                        </span>
                      </div>
                      {row.description ? (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {row.description}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/50 mt-0.5 italic">
                          No description
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Metadata pills */}
                  <div className="flex flex-wrap items-center gap-2">
                    {voiceName && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground font-medium">
                        <Mic className="size-3" />
                        {voiceName}
                      </span>
                    )}
                    {phoneLabel && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground font-medium font-mono">
                        <Phone className="size-3" />
                        {phoneLabel}
                      </span>
                    )}
                    {row.currentVersion && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-[22px] px-2 font-mono"
                      >
                        V{row.currentVersion.versionNumber}
                      </Badge>
                    )}
                  </div>

                  {/* Footer stats */}
                  <div className="flex items-center justify-between pt-3 border-t border-border/30">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <PhoneCall className="size-3.5" />
                      <span className="text-xs font-medium tabular-nums">
                        {row.callsLast7Days}
                      </span>
                      <span className="text-xs text-muted-foreground/60">
                        calls · 7d
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground/50">
                      {edited
                        ? format(edited, 'MMM d, yyyy')
                        : row.updatedAt}
                    </span>
                  </div>
                </div>

                {/* Hover accent bar */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary/60 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* ─── TABLE VIEW ─── */}
      {!loading && agents.length > 0 && viewMode === 'table' ? (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="font-semibold">Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Voice</TableHead>
                <TableHead>Phone number</TableHead>
                <TableHead>Last edited</TableHead>
                <TableHead className="text-right">Calls (7d)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((row) => {
                const edited = safeParseDate(row.updatedAt);
                const voiceName = resolveVoiceName(row.currentVersion?.voiceId);

                return (
                  <TableRow
                    key={row.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'size-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-[11px] shrink-0',
                            getGradient(row.name),
                          )}
                        >
                          {getInitials(row.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {row.name}
                          </p>
                          {row.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {row.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          {row.isActive ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </>
                          ) : (
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-400" />
                          )}
                        </span>
                        <Badge
                          variant={row.isActive ? 'outline' : 'secondary'}
                          className={
                            row.isActive
                              ? 'border-emerald-600/50 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300 text-[10px]'
                              : 'text-muted-foreground text-[10px]'
                          }
                        >
                          {row.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {voiceName ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Mic className="size-3" />
                          {voiceName}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatPhones(row.assignedPhoneNumbers) ?? (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {edited
                        ? format(edited, 'MMM d, yyyy h:mm a')
                        : row.updatedAt}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium">
                      {row.callsLast7Days}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/agents/${row.id}`}
                        className={cn(
                          buttonVariants({ variant: 'outline', size: 'sm' }),
                          'text-xs h-8',
                        )}
                      >
                        <Bot className="size-3.5 mr-1.5" />
                        Configure
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function safeParseDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function responseMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || response.statusText;
}
