'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  GitCompare,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Save,
  type LucideIcon,
  Volume2,
} from 'lucide-react';
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
  updatedAt: string;
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
  const [saveBusy, setSaveBusy] = useState<
    'update' | 'create' | 'publish' | 'phone' | null
  >(null);
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
  const promptIsValid = prompt.trim().length > 0 && selectedVoiceId.trim().length > 0;
  const versionPanelBusy = versionMutating !== null;
  const canUpdateCurrentVersion =
    promptHydrated &&
    selectedVersion != null &&
    hasUnsavedChanges &&
    promptIsValid &&
    saveBusy === null &&
    !versionPanelBusy;
  const canCreateNewVersion =
    promptHydrated &&
    hasUnsavedChanges &&
    promptIsValid &&
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
  const canPublishLive =
    promptHydrated &&
    selectedVersion != null &&
    !hasUnsavedChanges &&
    !isSelectedLive &&
    saveBusy === null &&
    !versionPanelBusy;
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
  const quickStateText = hasUnsavedChanges
    ? 'Unsaved edits in progress'
    : isSelectedLive
      ? 'Live version selected'
      : 'Previewing a saved version';
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
        `Viewing V${version.versionNumber}. Update this version or save V${nextVersionNumber} as a new version.`,
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

  const updateCurrentVersionFlow = async () => {
    if (saveInFlightRef.current || saveBusy !== null || versionPanelBusy) {
      return;
    }
    if (!activeOrgId || !agent || !selectedVersion) {
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
      setToast('No changes to update.');
      return;
    }
    if (
      isSelectedLive &&
      !window.confirm(
        'You are editing the live version currently serving calls. Update it in place?',
      )
    ) {
      return;
    }

    saveInFlightRef.current = true;
    setSaveBusy('update');
    setPageError(null);
    try {
      const res = await apiCall(
        `/api/v1/agents/${agentId}/versions/${selectedVersion.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildVersionPayload()),
        },
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || res.statusText);
      }
      const updated = (await res.json()) as AgentVersion;
      setVersions((current) =>
        sortVersionsDesc(
          [updated, ...current.filter((version) => version.id !== updated.id)],
        ),
      );
      setSelectedVersionId(updated.id);
      setPrompt(updated.systemPrompt);
      setSelectedVoiceId(updated.voiceId);
      setDraftPrompt('');
      setToast(
        updated.isLive
          ? `Updated live V${updated.versionNumber}.`
          : `Updated V${updated.versionNumber}.`,
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

  const createVersionFlow = async (
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
      setTinyChangeIntent({ message: tinyChangeWarning });
      return;
    }

    console.debug('[AgentEditor] Create version voice', {
      selectedVoiceId,
      selectedVoiceName: selectedVoice?.name ?? null,
    });

    saveInFlightRef.current = true;
    setSaveBusy('create');
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
      });
      setToast(`Created V${created.versionNumber}. Publish it when ready.`);
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

  const duplicateVersion = async (version: AgentVersion) => {
    if (saveInFlightRef.current || saveBusy !== null || versionPanelBusy) {
      return;
    }
    saveInFlightRef.current = true;
    setSaveBusy('create');
    setPageError(null);
    try {
      const res = await apiCall(`/api/v1/agents/${agentId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(versionPayloadFromVersion(version)),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || res.statusText);
      }
      const created = (await res.json()) as AgentVersion;
      setVersions((current) =>
        sortVersionsDesc(
          [created, ...current.filter((item) => item.id !== created.id)],
        ),
      );
      setSelectedVersionId(created.id);
      setPrompt(created.systemPrompt);
      setSelectedVoiceId(created.voiceId);
      setDraftPrompt('');
      setToast(`Duplicated V${version.versionNumber} as V${created.versionNumber}.`);
      await loadData(showAllVersions && allVersionsLoaded);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setPageError(message);
    } finally {
      saveInFlightRef.current = false;
      setSaveBusy(null);
    }
  };

  const copyVersionPrompt = async (version: AgentVersion) => {
    try {
      await navigator.clipboard.writeText(version.systemPrompt);
      setToast(`Copied V${version.versionNumber} prompt.`);
    } catch {
      setToast('Could not copy prompt.');
    }
  };

  const renderVersionRow = (
    v: AgentVersion,
    options: { pinnedLive?: boolean } = {},
  ) => {
    const isSelected = selectedVersion?.id === v.id;
    const isLatest = latestVersion?.id === v.id;
    const snippet = compactPromptSnippet(v.systemPrompt);
    const status = versionStatus(v, liveVersion, latestVersion);
    const timestamp = v.publishedAt ?? v.updatedAt ?? v.createdAt;

    return (
      <li
        key={options.pinnedLive ? `${v.id}-pinned` : v.id}
        className={cn(
          'group/version relative rounded-md px-2 py-2 text-xs transition-colors',
          v.isLive ? 'bg-primary/5' : 'hover:bg-muted/40',
          isSelected && 'bg-muted',
        )}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={versionPanelBusy}
            onClick={() => loadVersionIntoEditor(v)}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="font-semibold text-sm leading-none">
                V{v.versionNumber}
              </span>
              <Badge variant={v.isLive ? 'default' : 'secondary'}>
                {status}
              </Badge>
              {isSelected ? <Badge variant="outline">Open</Badge> : null}
              {isLatest ? <Badge variant="outline">Latest</Badge> : null}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {safeRelativeTime(timestamp)}
            </p>
            <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-muted-foreground">
              {snippet}
            </p>
          </button>
          <details className="relative shrink-0">
            <summary
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
                'list-none [&::-webkit-details-marker]:hidden',
              )}
              aria-label={`Actions for version ${v.versionNumber}`}
            >
              <MoreVertical className="size-3.5" aria-hidden />
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
              <VersionMenuButton
                icon={GitCompare}
                label="View diff"
                disabled={versionPanelBusy || versionHistoryBusy}
                onClick={() => void openPromptDiff(v)}
              />
              <VersionMenuButton
                icon={Rocket}
                label="Publish live"
                disabled={versionPanelBusy || v.isLive || hasUnsavedChanges}
                onClick={() => setPublishTarget(v)}
              />
              <VersionMenuButton
                icon={RotateCcw}
                label="Restore"
                disabled={versionPanelBusy}
                onClick={() => setRestoreTarget(v)}
              />
              <VersionMenuButton
                icon={Copy}
                label="Duplicate"
                disabled={versionPanelBusy || saveBusy !== null}
                onClick={() => void duplicateVersion(v)}
              />
              <VersionMenuButton
                icon={Copy}
                label="Copy prompt"
                disabled={versionPanelBusy}
                onClick={() => void copyVersionPrompt(v)}
              />
            </div>
          </details>
        </div>
      </li>
    );
  };

  const renderLiveSummary = () => {
    if (!liveVersion) {
      return (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium">No live version</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Create a version, then publish it before testing or receiving calls.
          </p>
        </div>
      );
    }

    return (
      <button
        type="button"
        className={cn(
          'w-full rounded-md border border-primary/25 bg-primary/5 p-3 text-left transition hover:bg-primary/10',
          selectedVersion?.id === liveVersion.id && 'ring-2 ring-primary/15',
        )}
        onClick={() => loadVersionIntoEditor(liveVersion)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Live version
            </p>
            <p className="mt-1 font-semibold">
              V{liveVersion.versionNumber} - Published -{' '}
              {safeRelativeTime(liveVersion.publishedAt ?? liveVersion.updatedAt)}
            </p>
          </div>
          <Badge>Live</Badge>
        </div>
        <p className="mt-2 text-muted-foreground text-xs">
          Currently serving preview and production calls.
        </p>
      </button>
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
    return <p className="text-muted-foreground text-sm">Loading agent...</p>;
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
    <div className="-m-4 min-h-screen bg-muted/10 sm:-m-6">
      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[100] max-w-sm rounded-lg border border-border bg-popover px-4 py-2 text-popover-foreground text-sm shadow-lg"
        >
          {toast}
        </div>
      ) : null}

      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
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
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }))}
                aria-label="Back to agents"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
              <h1 className="truncate font-semibold text-xl tracking-tight">
                {agent.name}
              </h1>
              <Badge variant={agent.isActive ? 'default' : 'secondary'}>
                {agent.isActive ? 'Active' : 'Inactive'}
              </Badge>
              <Badge variant={liveVersion ? 'secondary' : 'outline'}>
                Live {liveVersionLabel}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">
                {editorStatusText}
              </span>
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                {quickStateText}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={!canTest}
              title={testCallBlockedReason ?? 'Run a browser preview.'}
              onClick={() => setTestCallOpen(true)}
            >
              <Play className="size-4" aria-hidden />
              Preview Call
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!canUpdateCurrentVersion}
              title={
                selectedVersion
                  ? 'Save edits into the selected version without creating a new row.'
                  : 'Select a version before updating.'
              }
              onClick={() => void updateCurrentVersionFlow()}
            >
              {saveBusy === 'update' ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Update Version
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={!canCreateNewVersion}
              title="Save a new version from your current edits."
              onClick={() => void createVersionFlow()}
            >
              {saveBusy === 'create' ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              Save as New Version
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canPublishLive}
              title={
                hasUnsavedChanges
                  ? 'Update or create a version before publishing.'
                  : isSelectedLive
                    ? 'This version is already live.'
                    : 'Publish the selected version for Test Agent and production calls.'
              }
              onClick={() => selectedVersion && setPublishTarget(selectedVersion)}
            >
              <Rocket className="size-4" aria-hidden />
              Publish Version
            </Button>
          </div>
        </div>
      </div>

      {pageError ? (
        <div className="mx-auto max-w-[1500px] px-4 pt-4 sm:px-6">
          <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive text-sm">
            {pageError}
          </p>
        </div>
      ) : null}

      <TestCallModal
        open={testCallOpen}
        onOpenChange={setTestCallOpen}
        agentId={agentId}
        agentName={agent.name}
        apiCall={apiCall}
      />

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <Card className="overflow-hidden border-border/70 bg-background shadow-sm">
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
              Write assistant behavior, tone, boundaries, call goals, and escalation rules.
              Save polished changes as a new version, then publish when you are ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSelectedLive && hasUnsavedChanges ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-sm dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  You are editing the live version currently serving calls. Updating
                  it in place changes what callers and preview calls use.
                </p>
              </div>
            ) : null}
            {isViewingHistoricalVersion ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
                You are viewing an older version. Preview calls still use the
                published live version.
              </div>
            ) : null}
            {hasUnsavedChanges ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-sm dark:text-amber-300">
                Draft changes are not live yet. Update V{selectedVersion?.versionNumber ?? 'current'}
                {' '}or save V{nextVersionNumber}, then publish when ready.
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

        <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <Card className="border-border/70 bg-background shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Voice</CardTitle>
                {isSelectedLive ? <Badge variant="outline">Live voice</Badge> : null}
              </div>
              <CardDescription>
                Choose how the assistant sounds when this version is published.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md bg-muted/50 p-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-primary shadow-sm">
                    <Volume2 className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {selectedVoice?.name ?? 'Select a voice'}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      {selectedVoice?.rimeVoiceId ?? 'No voice selected'}
                    </p>
                  </div>
                </div>
              </div>
              <label className="block text-muted-foreground text-xs uppercase tracking-wide">
                Voice
              </label>
              <select
                className={fieldClass}
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
              >
                <option value="">Select voice...</option>
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
                  {previewBusy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Volume2 className="size-4" aria-hidden />
                  )}
                  {previewBusy ? 'Loading...' : 'Preview voice'}
                </Button>
                <audio ref={previewAudioRef} className="hidden" preload="none" />
              </div>
              {voices.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No voices are available yet.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-background shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle>Phone number</CardTitle>
              <CardDescription>Choose which number should route to this agent.</CardDescription>
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
                      ? ` -> ${p.agent.name}`
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

          <Card className="bg-background shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle>Version history</CardTitle>
              <CardDescription>
                Recent versions are highlighted. Open full history only when needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {renderLiveSummary()}
              {versions.length > 0 ? (
                <>
                  <div className="pt-1">
                    <p className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Recent versions
                    </p>
                    <ul className="max-h-[28rem] space-y-1 overflow-auto pr-1">
                      {displayedVersions.map((v) => renderVersionRow(v))}
                    </ul>
                  </div>
                  {shouldRenderPinnedLive && pinnedLiveVersion ? (
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Also live
                      </p>
                      <ul className="space-y-1">
                        {renderVersionRow(pinnedLiveVersion, {
                          pinnedLive: true,
                        })}
                      </ul>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <p className="text-muted-foreground text-xs">
                      {showAllVersions
                        ? `Showing all ${versions.length} versions.`
                        : `Showing latest ${Math.min(
                            VERSION_HISTORY_PREVIEW_LIMIT,
                            previewVersions.length,
                          )}.`}
                    </p>
                    {showAllVersions ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setShowAllVersions(false)}
                      >
                        Show recent only
                      </Button>
                    ) : canRevealAllVersions ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={versionHistoryBusy}
                        onClick={() => void loadFullVersionHistory()}
                      >
                        {versionHistoryBusy ? 'Loading...' : 'View full history'}
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-muted-foreground text-sm">
                  No versions yet. Write the first prompt and create V1.
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
              <DialogTitle>Prompt diff - {promptDiff.title}</DialogTitle>
              <DialogDescription>
                Compare prompt changes before restoring or publishing.
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
                  ? 'Restoring...'
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
                  setTinyChangeIntent(null);
                  void createVersionFlow({
                    confirmedTinyChange: true,
                  });
                }}
              >
                Create new version anyway
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
                Marks this version live for preview and production calls. Draft
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
                  ? 'Publishing...'
                  : 'Publish live'}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function VersionMenuButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.currentTarget.closest('details')?.removeAttribute('open');
        onClick();
      }}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

function sortVersionsDesc(versions: AgentVersion[]): AgentVersion[] {
  return [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
}

function versionPayloadFromVersion(version: AgentVersion): Record<string, unknown> {
  return {
    systemPrompt: version.systemPrompt,
    voiceId: version.voiceId,
    model: version.model,
    temperature: version.temperature,
    maxTokens: version.maxTokens,
    firstMessage: version.firstMessage ?? undefined,
    endCallPhrases: version.endCallPhrases,
  };
}

function versionStatus(
  version: AgentVersion,
  liveVersion: AgentVersion | null,
  latestVersion: AgentVersion | null,
): string {
  if (liveVersion?.id === version.id || version.isLive) {
    return 'Published';
  }
  if (latestVersion?.id === version.id) {
    return 'Draft';
  }
  return 'Archived';
}

function compactPromptSnippet(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return 'Empty prompt';
  }
  return normalized.length > 92 ? `${normalized.slice(0, 89)}...` : normalized;
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

function safeRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return formatDistanceToNow(d, { addSuffix: true });
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
