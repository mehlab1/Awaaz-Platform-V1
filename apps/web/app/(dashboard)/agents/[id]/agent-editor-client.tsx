'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { format } from 'date-fns';
import useLocalStorageState from 'use-local-storage-state';

import { AgentSystemPromptEditor } from '@/components/agent-system-prompt-editor';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOrgContext } from '@/components/org-context';
import { VersionPromptDiff } from '@/components/version-prompt-diff';
import { cn } from '@/lib/utils';

const TestCallModal = dynamic(
  () =>
    import('@/components/test-call-modal').then((m) => ({
      default: m.TestCallModal,
    })),
  { ssr: false },
);

interface AgentVersion {
  id: string;
  versionNumber: number;
  systemPrompt: string;
  voiceId: string;
  model: string;
  temperature: number;
  maxTokens: number;
  firstMessage: string | null;
  endCallPhrases: string[];
  isLive: boolean;
  publishedAt: string | null;
  createdAt: string;
}

interface AgentDetail {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  currentVersionId: string | null;
  currentVersion: AgentVersion | null;
}

interface VoiceDto {
  id: string;
  rimeVoiceId: string;
  name: string;
  previewAudioUrl: string | null;
}

interface PhoneDto {
  id: string;
  number: string;
  friendlyName: string | null;
  agent?:
    | {
        id: string;
        name: string;
        deletedAt: string | null;
      }
    | null;
}

export function AgentEditorClient({ agentId }: { agentId: string }) {
  const { activeOrgId, apiCall } = useOrgContext();
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [draftPrompt, setDraftPrompt] = useLocalStorageState(
    `agent-draft-${agentId}`,
    { defaultValue: '' },
  );

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [voices, setVoices] = useState<VoiceDto[]>([]);
  const [phones, setPhones] = useState<PhoneDto[]>([]);

  const [prompt, setPrompt] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [promptHydrated, setPromptHydrated] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saveBusy, setSaveBusy] = useState<'version' | 'publish' | 'phone' | null>(
    null,
  );
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [promptDiff, setPromptDiff] = useState<{
    title: string;
    oldValue: string;
    newValue: string;
  } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AgentVersion | null>(null);
  const [publishTarget, setPublishTarget] = useState<AgentVersion | null>(null);
  const [versionMutating, setVersionMutating] = useState<
    | { kind: 'restore' | 'publish'; versionId: string }
    | null
  >(null);
  const [testCallOpen, setTestCallOpen] = useState(false);

  useEffect(() => {
    setPromptHydrated(false);
    setPrompt('');
    setSelectedVoiceId('');
  }, [agentId]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!agent || promptHydrated) {
      return;
    }
    const baseline = agent.currentVersion?.systemPrompt ?? '';
    const useDraft = draftPrompt.trim().length > 0;
    setPrompt(useDraft ? draftPrompt : baseline);
    setSelectedVoiceId(agent.currentVersion?.voiceId ?? '');
    setPromptHydrated(true);
  }, [agent, draftPrompt, promptHydrated]);

  useEffect(() => {
    if (!promptHydrated) {
      return;
    }
    const id = window.setInterval(() => {
      setDraftPrompt(prompt);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [promptHydrated, prompt, setDraftPrompt]);

  const loadData = useCallback(async () => {
    if (!activeOrgId) {
      setLoading(false);
      setAgent(null);
      return;
    }
    setPageError(null);
    setLoading(true);
    try {
      const [
        agentRes,
        voicesRes,
        phonesRes,
        versionsRes,
      ] = await Promise.all([
        apiCall(`/api/v1/agents/${agentId}`, { method: 'GET' }),
        apiCall('/api/v1/voices', { method: 'GET' }),
        apiCall('/api/v1/phone-numbers', { method: 'GET' }),
        apiCall(`/api/v1/agents/${agentId}/versions`, { method: 'GET' }),
      ]);

      if (!agentRes.ok) {
        const txt = await agentRes.text();
        throw new Error(txt || agentRes.statusText);
      }
      if (!voicesRes.ok) {
        const txt = await voicesRes.text();
        throw new Error(txt || voicesRes.statusText);
      }
      if (!phonesRes.ok) {
        const txt = await phonesRes.text();
        throw new Error(txt || phonesRes.statusText);
      }
      if (!versionsRes.ok) {
        const txt = await versionsRes.text();
        throw new Error(txt || versionsRes.statusText);
      }

      const agentBody = (await agentRes.json()) as AgentDetail;
      const voicesBody = (await voicesRes.json()) as VoiceDto[];
      const phonesBody = (await phonesRes.json()) as PhoneDto[];
      const versionsBody = (await versionsRes.json()) as AgentVersion[];

      setAgent(agentBody);
      setVoices(voicesBody);
      setPhones(phonesBody);
      setVersions(
        [...versionsBody].sort((a, b) => b.versionNumber - a.versionNumber),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setPageError(message);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, agentId, apiCall]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
    };
  }, [previewObjectUrl]);

  const versionPanelBusy = versionMutating !== null;

  const openPromptDiff = useCallback((v: AgentVersion) => {
    const successor = versions.find(
      (o) => o.versionNumber === v.versionNumber + 1,
    );
    if (successor) {
      setPromptDiff({
        title: `V${v.versionNumber} → V${successor.versionNumber}`,
        oldValue: v.systemPrompt,
        newValue: successor.systemPrompt,
      });
      return;
    }
    const pred = versions.find(
      (o) => o.versionNumber === v.versionNumber - 1,
    );
    if (pred) {
      setPromptDiff({
        title: `V${pred.versionNumber} → V${v.versionNumber}`,
        oldValue: pred.systemPrompt,
        newValue: v.systemPrompt,
      });
      return;
    }
    setToast('Nothing to compare for this snapshot.');
  }, [versions]);

  const executeRestoreConfirmed = async () => {
    if (!activeOrgId || !restoreTarget) {
      return;
    }
    setPageError(null);
    setVersionMutating({ kind: 'restore', versionId: restoreTarget.id });
    try {
      const res = await apiCall(
        `/api/v1/agents/${agentId}/versions/${restoreTarget.id}/restore`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || res.statusText);
      }
      const restored = (await res.json()) as AgentVersion;
      setRestoreTarget(null);
      setToast(`Restored snapshot as version ${restored.versionNumber}.`);
      await loadData();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setPageError(message);
    } finally {
      setVersionMutating(null);
    }
  };

  const executePublishConfirmed = async () => {
    if (!activeOrgId || !publishTarget) {
      return;
    }
    const publishedNumber = publishTarget.versionNumber;
    setPageError(null);
    setVersionMutating({ kind: 'publish', versionId: publishTarget.id });
    try {
      const res = await apiCall(
        `/api/v1/agents/${agentId}/versions/${publishTarget.id}/publish`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || res.statusText);
      }
      setPublishTarget(null);
      setToast(`Published version ${publishedNumber} as live.`);
      await loadData();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setPageError(message);
    } finally {
      setVersionMutating(null);
    }
  };

  const buildVersionPayload = useCallback(() => {
    const live = agent?.currentVersion;
    const body: Record<string, unknown> = {
      systemPrompt: prompt,
      voiceId: selectedVoiceId,
      model: live?.model ?? 'llama-3.3-70b-versatile',
      temperature: live?.temperature ?? 0.7,
      maxTokens: live?.maxTokens ?? 1024,
      endCallPhrases: live?.endCallPhrases ?? [],
    };
    const fm = live?.firstMessage ?? undefined;
    if (fm !== undefined && fm !== null && fm.length > 0) {
      body.firstMessage = fm;
    }
    return body;
  }, [agent?.currentVersion, prompt, selectedVoiceId]);

  const saveVersionFlow = async (publish: boolean) => {
    if (!activeOrgId || !agent) {
      return;
    }
    if (!selectedVoiceId.trim()) {
      setToast('Select a voice.');
      return;
    }
    if (!prompt.trim()) {
      setToast('System prompt cannot be empty.');
      return;
    }

    setSaveBusy(publish ? 'publish' : 'version');
    setPageError(null);
    try {
      const res = await apiCall(`/api/v1/agents/${agentId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildVersionPayload()),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || res.statusText);
      }
      const created = (await res.json()) as AgentVersion;

      if (publish) {
        const pub = await apiCall(
          `/api/v1/agents/${agentId}/versions/${created.id}/publish`,
          { method: 'POST' },
        );
        if (!pub.ok) {
          const txt = await pub.text();
          throw new Error(txt || pub.statusText);
        }
      }

      setToast(
        publish
          ? `Saved & published version ${created.versionNumber}.`
          : `Saved as V${created.versionNumber}.`,
      );
      await loadData();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setPageError(message);
    } finally {
      setSaveBusy(null);
    }
  };

  const selectedVoice = voices.find((v) => v.rimeVoiceId === selectedVoiceId);

  const playVoicePreview = async () => {
    if (!selectedVoice) {
      setToast('Pick a voice to preview.');
      return;
    }

    const el = previewAudioRef.current;
    if (!el) {
      return;
    }

    setPreviewBusy(true);
    try {
      const res = await apiCall('/api/v1/voices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: selectedVoice.rimeVoiceId }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      const audioBlob = await res.blob();
      const nextUrl = URL.createObjectURL(audioBlob);
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
      setPreviewObjectUrl(nextUrl);
      el.src = nextUrl;
      await el.play();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setToast(message || 'Could not play preview.');
    } finally {
      setPreviewBusy(false);
    }
  };

  const attachedPhones = phones.filter(
    (p) => p.agent?.id === agentId && !p.agent?.deletedAt,
  );
  const primaryAttachedId =
    attachedPhones.length > 0 ? attachedPhones[0].id : '';

  const onPhoneRoutingChange = async (nextPhoneId: string) => {
    if (!activeOrgId) {
      return;
    }
    setSaveBusy('phone');
    setPageError(null);
    try {
      for (const p of attachedPhones) {
        if (p.id !== nextPhoneId || nextPhoneId === '') {
          const res = await apiCall(`/api/v1/phone-numbers/${p.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: null }),
          });
          if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt || res.statusText);
          }
        }
      }
      if (nextPhoneId) {
        const res = await apiCall(`/api/v1/phone-numbers/${nextPhoneId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || res.statusText);
        }
      }

      const phonesRes = await apiCall('/api/v1/phone-numbers', {
        method: 'GET',
      });
      if (phonesRes.ok) {
        setPhones((await phonesRes.json()) as PhoneDto[]);
      }
      setToast('Phone assignment updated.');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setPageError(message);
    } finally {
      setSaveBusy(null);
    }
  };

  const fieldClass =
    'mt-1 w-full max-w-md rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

  if (!activeOrgId && !loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an organization first.
      </p>
    );
  }

  if (loading && !agent) {
    return <p className="text-muted-foreground text-sm">Loading agent…</p>;
  }

  if (pageError && !agent) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{pageError}</p>
        <Link
          href="/agents"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Back to agents
        </Link>
      </div>
    );
  }

  if (!agent) {
    return null;
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[100] max-w-sm rounded-lg border border-border bg-popover px-4 py-2 text-popover-foreground text-sm shadow-lg"
        >
          {toast}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-semibold text-2xl tracking-tight">{agent.name}</h1>
            <Badge variant="outline">{agent.isActive ? 'Active' : 'Inactive'}</Badge>
            {agent.currentVersion?.isLive ? (
              <Badge variant="secondary">Live V{agent.currentVersion.versionNumber}</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">{agent.description}</p>
          <Link
            href="/agents"
            className="mt-2 inline-block text-primary text-sm underline-offset-4 hover:underline"
          >
            ← Agents
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={
              !agent.isActive ||
              !agent.currentVersion ||
              saveBusy !== null ||
              versionPanelBusy
            }
            title={
              !agent.isActive || !agent.currentVersion
                ? 'Activate the agent and configure a current version first.'
                : 'Run a browser preview over LiveKit.'
            }
            onClick={() => setTestCallOpen(true)}
          >
            Test Agent
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              saveBusy !== null || versionPanelBusy || !promptHydrated
            }
            onClick={() => void saveVersionFlow(false)}
          >
            {saveBusy === 'version' ? 'Saving…' : 'Save Version'}
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={
              saveBusy !== null || versionPanelBusy || !promptHydrated
            }
            onClick={() => void saveVersionFlow(true)}
          >
            {saveBusy === 'publish' ? 'Publishing…' : 'Save & Publish'}
          </Button>
        </div>
      </div>

      {pageError ? (
        <p className="text-sm text-destructive">{pageError}</p>
      ) : null}

      <TestCallModal
        open={testCallOpen}
        onOpenChange={setTestCallOpen}
        agentId={agentId}
        agentName={agent.name}
        apiCall={apiCall}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(16rem,20rem)]">
        <Card>
          <CardHeader>
            <CardTitle>System prompt</CardTitle>
            <CardDescription>
              Draft auto-saves to this browser every 30 seconds ({' '}
              <code className="text-xs">
                agent-draft-{agentId.slice(0, 8)}…
              </code>
              ).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {promptHydrated ? (
              <AgentSystemPromptEditor value={prompt} onChange={setPrompt} />
            ) : (
              <div className="min-h-[420px] rounded-md border border-dashed border-border bg-muted/30" />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Voice</CardTitle>
              <CardDescription>
                Preview uses live Rime audio without storing files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block text-muted-foreground text-xs uppercase tracking-wide">
                Voice
              </label>
              <select
                className={fieldClass}
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
              >
                <option value="">Select voice…</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.rimeVoiceId}>
                    {v.name} ({v.rimeVoiceId})
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void playVoicePreview()}
                  disabled={!selectedVoiceId || previewBusy}
                  title={
                    selectedVoiceId
                      ? 'Play this voice preview.'
                      : 'Select a voice first.'
                  }
                >
                  {previewBusy ? 'Loading preview...' : 'Play preview'}
                </Button>
                <audio ref={previewAudioRef} className="hidden" preload="none" />
              </div>
              {voices.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No voices in DB — run voices sync from the API (ADMIN) after Rime/storage is wired.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Phone number</CardTitle>
              <CardDescription>Assign inbound routing (OWNER/ADMIN PATCH).</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                className={fieldClass}
                value={primaryAttachedId}
                disabled={saveBusy === 'phone'}
                onChange={(e) => void onPhoneRoutingChange(e.target.value)}
              >
                <option value="">None attached</option>
                {phones.map((p) => {
                  const assignment =
                    p.agent && !p.agent.deletedAt
                      ? ` → ${p.agent.name}`
                      : ' (unassigned)';
                  return (
                    <option key={p.id} value={p.id}>
                      {p.number}
                      {p.friendlyName ? ` (${p.friendlyName})` : ''}
                      {assignment}
                    </option>
                  );
                })}
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Version history</CardTitle>
              <CardDescription>
                Newest first · diff compares adjacent versions (e.g. V1 → V2).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="max-h-80 space-y-2 overflow-auto text-xs">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-col gap-2 rounded-md border border-border px-2 py-2 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">
                        V{v.versionNumber}
                        {v.isLive ? (
                          <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                            live
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-muted-foreground">
                        {safeFormatDt(v.createdAt)}
                      </span>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={versionPanelBusy}
                        onClick={() => openPromptDiff(v)}
                      >
                        View diff
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={versionPanelBusy || v.isLive}
                        onClick={() => setPublishTarget(v)}
                      >
                        Publish…
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={versionPanelBusy}
                        onClick={() => setRestoreTarget(v)}
                      >
                        Restore…
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={promptDiff !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPromptDiff(null);
          }
        }}
      >
        {promptDiff ? (
          <DialogContent
            showCloseButton
            className="max-h-[calc(100vh-3rem)] w-[min(960px,calc(100vw-2rem))] max-w-none gap-3 overflow-hidden sm:max-w-none"
          >
            <DialogHeader>
              <DialogTitle>Prompt diff · {promptDiff.title}</DialogTitle>
              <DialogDescription>
                Side-by-side system prompt ({' '}
                <code className="text-xs">react-diff-viewer-continued</code> ).
              </DialogDescription>
            </DialogHeader>
            <VersionPromptDiff
              oldValue={promptDiff.oldValue}
              newValue={promptDiff.newValue}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPromptDiff(null)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setRestoreTarget(null);
          }
        }}
      >
        {restoreTarget ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Restore version {restoreTarget.versionNumber}?</DialogTitle>
              <DialogDescription>
                This creates a{' '}
                <strong className="text-foreground">new</strong> draft version copying that
                snapshot. It does not delete or overwrite anything.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={versionPanelBusy}
                onClick={() => setRestoreTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={versionPanelBusy}
                onClick={() => void executeRestoreConfirmed()}
              >
                {versionMutating?.kind === 'restore' &&
                versionMutating.versionId === restoreTarget.id
                  ? 'Restoring…'
                  : 'Restore'}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={publishTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPublishTarget(null);
          }
        }}
      >
        {publishTarget ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Publish version {publishTarget.versionNumber}?</DialogTitle>
              <DialogDescription>
                Marks this version live and clears the live flag from other snapshots.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={versionPanelBusy}
                onClick={() => setPublishTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={versionPanelBusy}
                onClick={() => void executePublishConfirmed()}
              >
                {versionMutating?.kind === 'publish' &&
                versionMutating.versionId === publishTarget.id
                  ? 'Publishing…'
                  : 'Publish live'}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function safeFormatDt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return format(d, 'MMM d yyyy HH:mm');
}

async function readApiError(res: Response): Promise<string> {
  const fallback = res.statusText || 'Preview generation failed.';
  const raw = await res.text();
  if (!raw.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === 'string') {
      return parsed.message;
    }
    if (Array.isArray(parsed.message)) {
      return parsed.message.join(', ');
    }
    if (typeof parsed.error === 'string') {
      return parsed.error;
    }
  } catch {
    return raw;
  }

  return fallback;
}
