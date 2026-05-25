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

const VERSION_HISTORY_PREVIEW_LIMIT = 5;

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
  const [allVersionsLoaded, setAllVersionsLoaded] = useState(false);
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [versionHistoryBusy, setVersionHistoryBusy] = useState(false);
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
  const [tinyChangeIntent, setTinyChangeIntent] = useState<{
    publish: boolean;
    message: string;
  } | null>(null);
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
    setAllVersionsLoaded(false);
    setShowAllVersions(false);
  }, [agentId]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const liveVersion = agent?.currentVersion ?? null;
  const latestVersion = versions[0] ?? liveVersion;
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
  const selectedVersionLabel = selectedVersion
    ? `V${selectedVersion.versionNumber}`
    : null;
  const liveVersionLabel = liveVersion
    ? `V${liveVersion.versionNumber}`
    : 'None';
  const draftBaseLabel =
    selectedVersionLabel ?? (liveVersion ? liveVersionLabel : 'a new prompt');
  const isSelectedLive =
    selectedVersion != null &&
    liveVersion != null &&
    selectedVersion.id === liveVersion.id;
  const isViewingHistoricalVersion =
    selectedVersion != null &&
    !isSelectedLive &&
    latestVersion != null &&
    selectedVersion.versionNumber < latestVersion.versionNumber;
  const editorStatusText = hasUnsavedChanges
    ? `Editing Draft Based on ${draftBaseLabel}`
    : isSelectedLive && selectedVersion
      ? `Viewing Live ${selectedVersionLabel}`
      : selectedVersion
        ? `Viewing ${selectedVersionLabel}`
        : 'No version selected';
  const draftStatusText = hasUnsavedChanges
    ? 'Editing draft changes'
    : 'No unpublished changes';
  const previewVersions = versions.slice(0, VERSION_HISTORY_PREVIEW_LIMIT);
  const pinnedLiveVersion =
    !showAllVersions && liveVersion
      ? versions.find((version) => version.id === liveVersion.id) ??
        liveVersion
      : null;
  const shouldRenderPinnedLive =
    pinnedLiveVersion != null &&
    !previewVersions.some((version) => version.id === pinnedLiveVersion.id);
  const displayedVersions = showAllVersions ? versions : previewVersions;
  const canRevealAllVersions =
    !showAllVersions &&
    (versions.length > VERSION_HISTORY_PREVIEW_LIMIT ||
      (!allVersionsLoaded && versions.length >= VERSION_HISTORY_PREVIEW_LIMIT));

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

  const loadData = useCallback(async (loadAllVersions = false) => {
    if (!activeOrgId) {
      setLoading(false);
      setAgent(null);
      setVersions([]);
      setAllVersionsLoaded(false);
      setShowAllVersions(false);
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
        apiCall(
          loadAllVersions
            ? `/api/v1/agents/${agentId}/versions`
            : `/api/v1/agents/${agentId}/versions?limit=${VERSION_HISTORY_PREVIEW_LIMIT}`,
          { method: 'GET' },
        ),
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
      const sortedVersions = sortVersionsDesc(
        loadAllVersions
          ? versionsBody
          : mergeVersions(versionsBody, agentBody.currentVersion),
      );

      setVersions(sortedVersions);
      setAllVersionsLoaded(loadAllVersions);
      setShowAllVersions(loadAllVersions);
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

  const loadFullVersionHistory = async () => {
    if (!activeOrgId || versionHistoryBusy) {
      return;
    }
    if (allVersionsLoaded) {
      setShowAllVersions(true);
      return;
    }
    setVersionHistoryBusy(true);
    setPageError(null);
    try {
      const res = await apiCall(`/api/v1/agents/${agentId}/versions`, {
        method: 'GET',
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || res.statusText);
      }
      const versionsBody = (await res.json()) as AgentVersion[];
      setVersions(sortVersionsDesc(versionsBody));
      setAllVersionsLoaded(true);
      setShowAllVersions(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setPageError(message);
    } finally {
      setVersionHistoryBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
    };
  }, [previewObjectUrl]);

  const openPromptDiff = useCallback(async (v: AgentVersion) => {
    let diffVersions = versions;

    const applyDiff = (candidateVersions: AgentVersion[]) => {
      const successor = candidateVersions.find(
        (o) => o.versionNumber === v.versionNumber + 1,
      );
      if (successor) {
        setPromptDiff({
          title: `V${v.versionNumber} -> V${successor.versionNumber}`,
          oldValue: v.systemPrompt,
          newValue: successor.systemPrompt,
        });
        return true;
      }
      const pred = candidateVersions.find(
        (o) => o.versionNumber === v.versionNumber - 1,
      );
      if (pred) {
        setPromptDiff({
          title: `V${pred.versionNumber} -> V${v.versionNumber}`,
          oldValue: pred.systemPrompt,
          newValue: v.systemPrompt,
        });
        return true;
      }
      return false;
    };

    if (applyDiff(diffVersions)) {
      return;
    }

    if (!allVersionsLoaded) {
      setVersionHistoryBusy(true);
      try {
        const res = await apiCall(`/api/v1/agents/${agentId}/versions`, {
          method: 'GET',
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || res.statusText);
        }
        diffVersions = sortVersionsDesc((await res.json()) as AgentVersion[]);
        setVersions(diffVersions);
        setAllVersionsLoaded(true);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setPageError(message);
        return;
      } finally {
        setVersionHistoryBusy(false);
      }
    }

    if (applyDiff(diffVersions)) {
      return;
    }
    setToast('Nothing to compare for this snapshot.');
  }, [agentId, allVersionsLoaded, apiCall, versions]);

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
        `Viewing V${version.versionNumber}. Edits become draft changes until saved or published as V${nextVersionNumber}.`,
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
      setToast(`Restored snapshot as draft V${restored.versionNumber}.`);
      await loadData(showAllVersions && allVersionsLoaded);
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
      setToast(`Published live V${publishedNumber}.`);
      await loadData(showAllVersions && allVersionsLoaded);
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

  const saveVersionFlow = async (
    publish: boolean,
    options: { confirmedTinyChange?: boolean } = {},
  ) => {
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
    const tinyChangeWarning =
      selectedVersion && prompt !== selectedVersion.systemPrompt
        ? getTinyChangeWarning(
            selectedVersion.systemPrompt,
            prompt,
            selectedVersion.versionNumber,
          )
        : null;
    if (tinyChangeWarning && !options.confirmedTinyChange) {
      setTinyChangeIntent({ publish, message: tinyChangeWarning });
      return;
    }

    console.debug('[AgentEditor] Save version voice', {
      selectedVoiceId,
      selectedVoiceName: selectedVoice?.name ?? null,
      publish,
    });

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
      console.debug('[AgentEditor] Saved version voice', {
        versionId: created.id,
        versionNumber: created.versionNumber,
        voiceId: created.voiceId,
        published: publish,
      });

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
          ? `Published live V${created.versionNumber}.`
          : `Saved draft V${created.versionNumber}.`,
      );
      await loadData(showAllVersions && allVersionsLoaded);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setPageError(message);
    } finally {
      saveInFlightRef.current = false;
      setSaveBusy(null);
    }
  };

  const selectedVoice = voices.find((v) => v.rimeVoiceId === selectedVoiceId);
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
      liveVersionVoiceId: liveVersion?.voiceId ?? null,
      selectedVoiceId,
      selectedVoiceName: selectedVoice?.name ?? null,
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
    loading,
    promptHydrated,
    saveBusy,
    liveVersion?.versionNumber,
    liveVersion?.voiceId,
    selectedVoice?.name,
    selectedVoiceId,
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
      console.debug('[AgentEditor] Voice preview request', {
        selectedVoiceId,
        rimeVoiceId: selectedVoice.rimeVoiceId,
        voiceName: selectedVoice.name,
      });
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

  const renderVersionCard = (
    v: AgentVersion,
    options: { pinnedLive?: boolean } = {},
  ) => {
    const isSelected = selectedVersion?.id === v.id;
    const isLatest = latestVersion?.id === v.id;
    const snippet = v.systemPrompt.trim() || 'Empty prompt';

    return (
      <li
        key={options.pinnedLive ? `${v.id}-pinned` : v.id}
        className={cn(
          'rounded-lg border bg-background p-2.5 text-xs transition',
          v.isLive ? 'border-primary/35 bg-primary/5' : 'border-border',
          isSelected
            ? 'shadow-sm ring-2 ring-primary/10'
            : 'hover:border-muted-foreground/30',
        )}
      >
        <button
          type="button"
          className="block w-full text-left"
          disabled={versionPanelBusy}
          onClick={() => loadVersionIntoEditor(v)}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold leading-none">
              V{v.versionNumber}
            </span>
            {isSelected ? <Badge variant="secondary">Viewing</Badge> : null}
            {v.isLive ? <Badge variant="outline">Live</Badge> : null}
            {isLatest ? <Badge variant="outline">Latest</Badge> : null}
            {options.pinnedLive ? <Badge variant="outline">Pinned</Badge> : null}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Created {safeFormatDt(v.createdAt)}
          </p>
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            &quot;{snippet}&quot;
          </p>
        </button>
        <div className="mt-2 flex flex-wrap gap-1.5 border-border border-t pt-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={versionPanelBusy || versionHistoryBusy}
            onClick={() => void openPromptDiff(v)}
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
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
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground">
              {editorStatusText}
            </span>
            <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
              Published Live Version: {liveVersionLabel}
            </span>
            <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
              {draftStatusText}
            </span>
          </div>
          <p className="mt-2 text-muted-foreground text-xs">
            Test Agent and production calls always use the published live version.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2 sm:justify-end">
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
                `Save Draft V${nextVersionNumber}`
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
                `Publish Live V${nextVersionNumber}`
              )}
            </Button>
          </div>
          <p className="max-w-sm text-muted-foreground text-xs sm:text-right">
            Save Draft stores a historical version. Publish Live deploys that new
            version for Test Agent and production calls.
          </p>
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
                    ? `Draft from V${selectedVersion.versionNumber}`
                    : isSelectedLive
                      ? `Viewing Live V${selectedVersion.versionNumber}`
                      : `Viewing V${selectedVersion.versionNumber}`}
                </Badge>
              ) : null}
            </div>
            <CardDescription>
              Write assistant behavior, tone, boundaries, call goals, and escalation
              rules in natural language. Save Draft creates a non-live version.
              Publish Live creates a version and deploys it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isViewingHistoricalVersion ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
                You are viewing an older version. Test Agent still uses the
                published live version.
              </div>
            ) : null}
            {hasUnsavedChanges ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-sm dark:text-amber-300">
                Editing draft changes. Use Save Draft to create V{nextVersionNumber},
                or Publish Live to deploy V{nextVersionNumber}.
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
                Showing the newest versions first. Older versions stay stored and
                are available from View all versions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {versions.length > 0 ? (
                <>
                  <ul className="max-h-[32rem] space-y-2 overflow-auto pr-1">
                    {displayedVersions.map((v) => renderVersionCard(v))}
                  </ul>
                  {shouldRenderPinnedLive && pinnedLiveVersion ? (
                    <div className="space-y-2 border-border border-t pt-3">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Pinned live version
                      </p>
                      <ul className="space-y-2">
                        {renderVersionCard(pinnedLiveVersion, {
                          pinnedLive: true,
                        })}
                      </ul>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2 border-border border-t pt-3">
                    <p className="text-muted-foreground text-xs">
                      {showAllVersions
                        ? `Showing all ${versions.length} versions.`
                        : `Showing latest ${Math.min(
                            VERSION_HISTORY_PREVIEW_LIMIT,
                            previewVersions.length,
                          )} versions.`}
                    </p>
                    {showAllVersions ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setShowAllVersions(false)}
                      >
                        Show latest 5
                      </Button>
                    ) : canRevealAllVersions ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={versionHistoryBusy}
                        onClick={() => void loadFullVersionHistory()}
                      >
                        {versionHistoryBusy ? 'Loading...' : 'View all versions'}
                      </Button>
                    ) : null}
                  </div>
                </>
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
        open={tinyChangeIntent !== null}
        onOpenChange={(next) => {
          if (!next) {
            setTinyChangeIntent(null);
          }
        }}
      >
        {tinyChangeIntent ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create new version anyway?</DialogTitle>
              <DialogDescription>{tinyChangeIntent.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saveBusy !== null}
                onClick={() => setTinyChangeIntent(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={saveBusy !== null}
                onClick={() => {
                  const intent = tinyChangeIntent;
                  setTinyChangeIntent(null);
                  void saveVersionFlow(intent.publish, {
                    confirmedTinyChange: true,
                  });
                }}
              >
                {tinyChangeIntent.publish
                  ? 'Publish live anyway'
                  : 'Save draft anyway'}
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
                Marks this version live for Test Agent and production calls. Draft
                snapshots remain stored in history.
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

function sortVersionsDesc(versions: AgentVersion[]): AgentVersion[] {
  return [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
}

function mergeVersions(
  versions: AgentVersion[],
  extraVersion: AgentVersion | null,
): AgentVersion[] {
  if (!extraVersion) {
    return versions;
  }
  if (versions.some((version) => version.id === extraVersion.id)) {
    return versions;
  }
  return [extraVersion, ...versions];
}

function getTinyChangeWarning(
  previousValue: string,
  nextValue: string,
  previousVersionNumber: number,
): string | null {
  const before = previousValue.trim();
  const after = nextValue.trim();
  if (before === after) {
    return previousValue === nextValue
      ? null
      : `This version only changes whitespace from V${previousVersionNumber}. Create new version anyway?`;
  }

  if (before.replace(/\s+/g, '') === after.replace(/\s+/g, '')) {
    return `This version only changes whitespace from V${previousVersionNumber}. Create new version anyway?`;
  }

  const punctuationAndWhitespace =
    /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+/g;
  if (
    before.replace(punctuationAndWhitespace, '').toLowerCase() ===
    after.replace(punctuationAndWhitespace, '').toLowerCase()
  ) {
    return `This version only changes punctuation or spacing from V${previousVersionNumber}. Create new version anyway?`;
  }

  const maxLength = Math.max(before.length, after.length);
  if (maxLength < 40) {
    return null;
  }

  const changed = getChangedSegment(before, after);
  const changedLength = Math.max(changed.before.length, changed.after.length);
  if (changedLength > 256) {
    return null;
  }

  const threshold = Math.max(3, Math.min(16, Math.ceil(maxLength * 0.02)));
  const distance = boundedLevenshtein(changed.before, changed.after, threshold);
  if (distance > 0 && distance <= threshold) {
    return `This version differs only slightly from V${previousVersionNumber}. Create new version anyway?`;
  }

  return null;
}

function getChangedSegment(
  before: string,
  after: string,
): { before: string; after: string } {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) {
    start += 1;
  }

  let beforeEnd = before.length - 1;
  let afterEnd = after.length - 1;
  while (
    beforeEnd >= start &&
    afterEnd >= start &&
    before[beforeEnd] === after[afterEnd]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return {
    before: before.slice(start, beforeEnd + 1),
    after: after.slice(start, afterEnd + 1),
  };
}

function boundedLevenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) {
    return limit + 1;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMinimum = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      current[j] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) {
      return limit + 1;
    }
    previous = current;
  }

  return previous[b.length] ?? limit + 1;
}

function safeFormatDt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return format(d, "MMM d, yyyy 'at' h:mm a");
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
