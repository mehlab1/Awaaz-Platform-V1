'use client';

import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrgContext } from '@/components/org-context';
import { cn } from '@/lib/utils';
import {
  CreateAgentDialog,
  type CreateAgentInput,
  type VoiceOption,
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

interface CreatedAgentVersion {
  id: string;
}

const CREATE_AGENT_ROLES = new Set(['OWNER', 'ADMIN', 'BUILDER']);

export default function AgentsPage() {
  const router = useRouter();
  const { activeOrgId, apiCall, orgs } = useOrgContext();
  const [agents, setAgents] = useState<AgentListRow[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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
  const canCreateAgent = CREATE_AGENT_ROLES.has(activeOrg?.role ?? '');

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

      const versionRes = await apiCall(`/api/v1/agents/${agent.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: input.systemPrompt,
          voiceId: input.voiceId,
          model: 'llama-3.3-70b-versatile',
          temperature: 0.7,
          maxTokens: 1024,
          firstMessage: `Hi, this is ${input.name}. How can I help you today?`,
          endCallPhrases: ['goodbye', 'bye', 'thank you'],
        }),
      });
      if (!versionRes.ok) {
        throw new Error(await responseMessage(versionRes));
      }
      const version = (await versionRes.json()) as CreatedAgentVersion;

      const publishRes = await apiCall(
        `/api/v1/agents/${agent.id}/versions/${version.id}/publish`,
        { method: 'POST' },
      );
      if (!publishRes.ok) {
        throw new Error(await responseMessage(publishRes));
      }

      await loadData();
      router.push(`/agents/${agent.id}`);
    } finally {
      setCreating(false);
    }
  };

  const formatPhones = (nums: string[]) => {
    if (nums.length === 0) {
      return '—';
    }
    if (nums.length === 1) {
      return nums[0];
    }
    return `${nums[0]} (+${nums.length - 1})`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-1 max-w-xl text-muted-foreground text-sm">
            Organization{' '}
            <span className="font-mono text-xs">{activeOrgId ?? '—'}</span>.
            Switch org in the sidebar to refresh tenant data.
          </p>
        </div>
        <CreateAgentDialog
          isBusy={creating}
          canCreate={canCreateAgent}
          voices={voices}
          onSubmit={createAgent}
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!activeOrgId ? (
        <p className="text-sm text-muted-foreground">
          Select an organization to load agents.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading agents…</p>
      ) : null}

      {!loading && activeOrgId && agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No agents found. Create one with New Agent or seed the Sirius agent
          from the API package.
        </p>
      ) : null}

      {!loading && agents.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
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
              const voiceLabel = row.currentVersion?.voiceId ?? '—';

              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={row.isActive ? 'outline' : 'secondary'}
                      className={
                        row.isActive
                          ? 'border-emerald-600/50 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300'
                          : 'text-muted-foreground'
                      }
                    >
                      {row.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{voiceLabel}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatPhones(row.assignedPhoneNumbers)}
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {edited
                      ? format(edited, 'MMM d, yyyy h:mm a')
                      : row.updatedAt}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.callsLast7Days}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/agents/${row.id}`}
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                      )}
                    >
                      Edit
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
