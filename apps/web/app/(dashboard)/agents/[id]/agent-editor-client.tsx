'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
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
  const saveInFlightRef = useRef(false);

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
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
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
    setSelectedVersionId(null);
  }, [agentId]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const latestVersion = versions[0] ?? agent?.currentVersion ?? null;
  const selectedVersion =
    selectedVersionId !== null
      ? versions.find((version) => version.id === selectedVersionId) ??
        latestVersion
      : latestVersion;
  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
  const hasUnsavedChanges =
    promptHydrated &&
    (selectedVersion
      ? prompt !== selectedVersion.systemPrompt ||
        selectedVoiceId !== selectedVersion.voiceId
      : prompt.trim().length > 0 || selectedVoiceId.trim().length > 0);
  const versionPanelBusy = versionMutating !== null;
  const canSaveVersion =
    promptHydrated &&
    hasUnsavedChanges &&
    saveBusy === null &&
    !versionPanelBusy;

  useEffect(() => {
    if (!agent || promptHydrated) {
      return;
    }
    const baselineVersion = versions[0] ?? agent.currentVersion;
    const baseline = baselineVersion?.systemPrompt ?? '';
    const useDraft = draftPrompt.trim().length > 0;
    setPrompt(useDraft ? draftPrompt : baseline);
    setSelectedVoiceId(baselineVersion?.voiceId ?? '');
    setSelectedVersionId(baselineVersion?.id ?? null);
    setPromptHydrated(true);
  }, [agent, draftPrompt, promptHydrated, versions]);

  useEffect(() => {
    if (!promptHydrated) {
      return;
    }
    if (!hasUnsavedChanges) {
      setDraftPrompt('');
      return;
    }
    const id = window.setTimeout(() => {
      setDraftPrompt(prompt);
    }, 800);
    return () => window.clearTimeout(id);
  }, [hasUnsavedChanges, promptHydrated, prompt, setDraftPrompt]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      setDraftPrompt(prompt);
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges, prompt, setDraftPrompt]);

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
      const sortedVersions = [...versionsBody].sort(
        (a, b) => b.versionNumber - a.versionNumber,
      );

      setVersions(sortedVersions);
      setAgent(agentBody);
      setVoices(voicesBody);
      setPhones(phonesBody);
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

  const openPromptDiff = useCallback((v: AgentVersion) => {
    const successor = versions.find(
      (o) => o.versionNumber === v.versionNumber + 1,
    );
    if (successor) {
      setPromptDiff({
        title: `V${v.versionNumber} -> V${successor.versionNumber}`,
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
        title: `V${pred.versionNumber} -> V${v.versionNumber}`,
        oldValue: pred.systemPrompt,
        newValue: v.systemPrompt,
      });
      return;
    }
    setToast('Nothing to compare for this snapshot.');
  }, [versions]);

  const loadVersionIntoEditor = useCallback(
    (version: AgentVersion) => {
      if (
        hasUnsavedChanges &&
        version.id !== selectedVersionId &&
        !window.confirm('Discard the unsaved prompt draft and open this version?')
      ) {
        return;
      }
      setSelectedVersionId(version.id);
      setPrompt(version.systemPrompt);
      setSelectedVoiceId(version.voiceId);
      setDraftPrompt('');
      setToast(
        `Viewing V${version.versionNumber}. Edits will save as V${nextVersionNumber}.`,
      );
    },
    [hasUnsavedChanges, nextVersionNumber, selectedVersionId, setDraftPrompt],
  );

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
      setVersions((current) =>
        [restored, ...current.filter((version) => version.id !== restored.id)].sort(
          (a, b) => b.versionNumber - a.versionNumber,
        ),
      );
      setSelectedVersionId(restored.id);
      setPrompt(restored.systemPrompt);
      setSelectedVoiceId(restored.voiceId);
      setDraftPrompt('');
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
    const source = selectedVersion ?? agent?.currentVersion;
    const body: Record<string, unknown> = {
      systemPrompt: prompt,
      voiceId: selectedVoiceId,
      model: source?.model ?? 'llama-3.3-70b-versatile',
      temperature: source?.temperature ?? 0.7,
      maxTokens: source?.maxTokens ?? 1024,
      endCallPhrases: source?.endCallPhrases ?? [],
    };
    const fm = source?.firstMessage ?? undefined;
    if (fm !== undefined && fm !== null && fm.length > 0) {
      body.firstMessage = fm;
    }
    return body;
  }, [agent?.currentVersion, prompt, selectedVersion, selectedVoiceId]);

  const saveVersionFlow = async (publish: boolean) => {
    if (saveInFlightRef.current || saveBusy !== null || versionPanelBusy) {
      return;
    }
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
    if (!hasUnsavedChanges) {
      setToast('No prompt changes to save.');
      return;
    }

    saveInFlightRef.current = true;
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
      setVersions((current) =>
        [created, ...current.filter((version) => version.id !== created.id)].sort(
          (a, b) => b.versionNumber - a.versionNumber,
        ),
      );
      setSelectedVersionId(created.id);
      setPrompt(created.systemPrompt);
      setSelectedVoiceId(created.voiceId);
      setDraftPrompt('');

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
      saveInFlightRef.current = false;
      setSaveBusy(null);
    }
  };

  const selectedVoice = voices.find((v) => v.rimeVoiceId === selectedVoiceId);
  const liveVersion = agent?.currentVersion ?? null;
  const hasUsableLiveConfig =
    liveVersion != null &&
    liveVersion.systemPrompt.trim().length > 0 &&
    liveVersion.voiceId.trim().length > 0;

  const testCallBlockedReason = loading
    ? 'Agent is still loading.'
    : !agent
      ? 'Agent failed to load.'
      : saveBusy !== null
        ? 'Wait for save or publish to finish before testing.'
        : versionPanelBusy
          ? 'Wait for the version action to finish before testing.'
          : !promptHydrated
            ? 'Editor is still loading.'
            : hasUnsavedChanges
              ? 'Save or discard unsaved changes before testing.'
              : !agent.isActive
                ? 'Activate the agent before testing.'
                : !liveVersion
                  ? 'Publish a version before testing.'
                  : !hasUsableLiveConfig
                    ? 'Live version is missing a system prompt or voice.'
                    : null;

  const canTest = testCallBlockedReason === null;

  useEffect(() => {
    console.debug('[AgentEditor] Test Agent gate', {
      canTest,
      testCallBlockedReason,
      loading,
      promptHydrated,
      hasUnsavedChanges,
      saveBusy,
      versionPanelBusy,
      agentActive: agent?.isActive ?? null,
      liveVersionId: agent?.currentVersionId ?? null,
      liveVersionNumber: liveVersion?.versionNumber ?? null,
      selectedVersionId,
      selectedVersionNumber: selectedVersion?.versionNumber ?? null,
      hasUsableLiveConfig,
    });
  }, [
    agent?.currentVersionId,
    agent?.isActive,
    canTest,
    hasUnsavedChanges,
    hasUsableLiveConfig,
    liveVersion?.versionNumber,
    loading,
    promptHydrated,
    saveBusy,
    selectedVersion?.versionNumber,
    selectedVersionId,
    testCallBlockedReason,
    versionPanelBusy,
  ]);

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
            onClick={(event) => {
              if (
                hasUnsavedChanges &&
                !window.confirm('Leave this editor and discard unsaved prompt changes?')
              ) {
                event.preventDefault();
              }
            }}
            className="mt-2 inline-block text-primary text-sm underline-offset-4 hover:underline"
          >
            ← Agents
          </Link>
          <p className="mt-2 text-muted-foreground text-xs">
            {selectedVersion
              ? `Viewing V${selectedVersion.versionNumber}. Saving creates V${nextVersionNumber}.`
              : `No version selected. Saving creates V${nextVersionNumber}.`}
            {hasUnsavedChanges ? ' Unsaved changes.' : ' No unsaved changes.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!canTest}
            title={testCallBlockedReason ?? 'Run a browser preview over LiveKit.'}
            onClick={() => setTestCallOpen(true)}
          >
            Test Agent
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canSaveVersion}
            onClick={() => void saveVersionFlow(false)}
          >
            {saveBusy === 'version' ? (
              <>
                <Loader2 className="animate-spin" />
                Saving...
              </>
            ) : (
              `Save Version V${nextVersionNumber}`
            )}
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={!canSaveVersion}
            onClick={() => void saveVersionFlow(true)}
          >
            {saveBusy === 'publish' ? (
              <>
                <Loader2 className="animate-spin" />
                Publishing...
              </>
            ) : (
              `Save & Publish V${nextVersionNumber}`
            )}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>System prompt</CardTitle>
              {selectedVersion ? (
                <Badge variant={hasUnsavedChanges ? 'outline' : 'secondary'}>
                  {hasUnsavedChanges
                    ? `Editing from V${selectedVersion.versionNumber}`
                    : `Viewing V${selectedVersion.versionNumber}`}
                </Badge>
              ) : null}
            </div>
            <CardDescription>
              Write assistant behavior, tone, boundaries, call goals, and escalation
              rules in natural language. Save creates a new version and keeps older
              versions intact.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasUnsavedChanges ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-sm dark:text-amber-300">
                Unsaved prompt changes. Use Save Version to create V{nextVersionNumber}.
              </div>
            ) : null}
            {promptHydrated ? (
              <AgentSystemPromptEditor
                value={prompt}
                onChange={setPrompt}
                disabled={saveBusy !== null}
              />
            ) : (
              <div className="min-h-[520px] rounded-2xl border border-dashed border-border bg-muted/30" />
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
                Prompt snapshots are newest first. Select any version to view it, then edit and save as a new snapshot.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {versions.length > 0 ? (
                <ul className="max-h-[32rem] space-y-3 overflow-auto pr-1 text-xs">
                  {versions.map((v, index) => {
                    const isSelected = selectedVersion?.id === v.id;
                    const isLatest = index === 0;
                    return (
                      <li
                        key={v.id}
                        className={cn(
                          'rounded-xl border bg-background p-3 transition',
                          isSelected
                            ? 'border-primary/50 shadow-sm ring-2 ring-primary/10'
                            : 'border-border hover:border-muted-foreground/30',
                        )}
                      >
                        <button
                          type="button"
                          className="block w-full text-left"
                          disabled={versionPanelBusy}
                          onClick={() => loadVersionIntoEditor(v)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">V{v.versionNumber}</span>
                            {isSelected ? <Badge variant="secondary">Viewing</Badge> : null}
                            {v.isLive ? <Badge variant="outline">Live</Badge> : null}
                            {isLatest ? <Badge variant="outline">Latest</Badge> : null}
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            Created {safeFormatDt(v.createdAt)}
                          </p>
                          <p className="mt-2 line-clamp-2 text-muted-foreground">
                            {v.systemPrompt.trim() || 'Empty prompt'}
                          </p>
                        </button>
                        <div className="mt-3 flex flex-wrap justify-end gap-1.5 border-border border-t pt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={versionPanelBusy}
                            onClick={() => openPromptDiff(v)}
                          >
                            Diff
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            disabled={versionPanelBusy || v.isLive}
                            onClick={() => setPublishTarget(v)}
                          >
                            Publish
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={versionPanelBusy}
                            onClick={() => setRestoreTarget(v)}
                          >
                            Restore
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-muted-foreground text-sm">
                  No versions yet. Write the first prompt and save it as V1.
                </p>
              )}
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
