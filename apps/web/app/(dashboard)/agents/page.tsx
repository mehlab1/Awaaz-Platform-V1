'use client';

import { useEffect, useState } from 'react';

import { useOrgContext } from '@/components/org-context';

interface AgentRow {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export default function AgentsPage() {
  const { activeOrgId, apiCall } = useOrgContext();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeOrgId) {
      setAgents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await apiCall('/api/v1/agents', { method: 'GET' });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }
        const data = (await res.json()) as AgentRow[];
        if (!cancelled) {
          setAgents(data);
        }
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, apiCall]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Agents</h1>
      <p className="mt-2 text-muted-foreground">
        Scoped to organization{' '}
        <span className="font-mono text-xs">{activeOrgId ?? '—'}</span>. Switch
        org in the sidebar to refresh this list.
      </p>
      {error ? (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      ) : null}
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading agents…</p>
      ) : null}
      {!loading && agents.length === 0 && activeOrgId ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No agents yet. Create one via the API (BUILDER role).
        </p>
      ) : null}
      {agents.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {agents.map((a) => (
            <li key={a.id} className="rounded border border-border px-3 py-2">
              <span className="font-medium">{a.name}</span>
              <span className="ml-2 text-muted-foreground">
                {a.isActive ? 'active' : 'inactive'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
