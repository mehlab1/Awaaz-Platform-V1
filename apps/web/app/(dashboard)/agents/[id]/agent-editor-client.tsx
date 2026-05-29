'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  GitCompare,
  History,
  Info,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  type LucideIcon,
  Volume2,
} from 'lucide-react';
import useLocalStorageState from 'use-local-storage-state';

import { AgentSystemPromptEditor } from '@/components/agent-system-prompt-editor';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

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
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 grid place-items-center bg-background/40 backdrop-blur-sm">
        <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground shadow-lg">
          Loading test tools...
        </div>
      </div>
    ),
  },
);

let testCallModalPreloaded = false;

function preloadTestCallModal() {
  if (testCallModalPreloaded) {
    return;
  }
  testCallModalPreloaded = true;
  void import('@/components/test-call-modal');
}

const VERSION_HISTORY_PREVIEW_LIMIT = 3;
const DEFAULT_LLM_MODEL = 'llama-3.3-70b-versatile';

const LLM_OPTIONS = [
  { value: DEFAULT_LLM_MODEL, label: 'Groq - Llama 3.3 70B Versatile' },
] as const;

const TTS_OPTIONS = [
  { value: 'rime', label: 'Rime TTS' },
] as const;

const STT_OPTIONS = [
  { value: 'deepgram', label: 'Deepgram STT' },
] as const;

const BLUEPRINTS = [
  {
    id: 'support',
    name: 'Customer Support',
    description: 'Friendly agent focused on answering questions, billing help, and graceful human escalation.',
    template: `You are a friendly and helpful customer support agent for Acme Corp. Your goals are:
1. Resolve user issues and answer questions about billing and services.
2. Escalate to a human agent ONLY if specifically requested or if unresolved after 3 attempts.
3. Keep answers concise (under 2 sentences) and maintain a polite, empathetic tone.`
  },
  {
    id: 'scheduler',
    name: 'Appointment Booking',
    description: 'Dental/medical scheduling assistant collecting preferred days, times, and customer info.',
    template: `You are a scheduling assistant for Dr. Smith's Dental Office. Your goals are:
1. Book patients for checkups, cleanings, or urgent care.
2. Ask for their preferred day (Monday-Friday) and time (morning/afternoon).
3. Confirm patient name, phone number, and reason for visit before finishing.
4. Keep the tone professional, structured, and friendly.`
  },
  {
    id: 'qualifier',
    name: 'Sales Lead Qualifier',
    description: 'Persuasive outbound agent qualifying leads based on volume, timeline, and decision power.',
    template: `You are an outbound sales representative for Awaaz AI. Your goals are:
1. Qualify inbound leads by asking: call volume, timeline, and decision role.
2. If qualified (calls > 100/day, timeline < 1 month), schedule a product demo.
3. Maintain an energetic, confident, and persuasive tone.`
  },
  {
    id: 'screener',
    name: 'Interview Screener',
    description: 'HR recruiter screening candidates on experience, salary expectation, and start date.',
    template: `You are an HR recruiter screening candidates for the Software Engineer role. Your goals are:
1. Verify candidate's years of experience with React/Node.
2. Confirm their salary expectations and notice period.
3. Note their availability for a technical interview.
4. Keep the tone professional, welcoming, and objective.`
  }
];

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

interface PipelineOption {
  readonly value: string;
  readonly label: string;
}

export function AgentEditorClient({ agentId }: { agentId: string }) {
  const { activeOrgId, apiCall } = useOrgContext();
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const saveInFlightRef = useRef(false);
  const voicesLoadedRef = useRef(false);
  const phonesLoadedOrgRef = useRef<string | undefined>(undefined);

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
  const [openVersionMenuId, setOpenVersionMenuId] = useState<string | null>(null);
  const [versionMutating, setVersionMutating] = useState<
    | { kind: 'restore' | 'publish'; versionId: string }
    | null
  >(null);
  const [testCallOpen, setTestCallOpen] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceSearchQuery, setVoiceSearchQuery] = useState('');
  const [voiceSaveBusy, setVoiceSaveBusy] = useState(false);
  const [phoneDropdownOpen, setPhoneDropdownOpen] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [previewingVersion, setPreviewingVersion] = useState<AgentVersion | null>(null);
  const [fullHistoryOpen, setFullHistoryOpen] = useState(false);
  const [navVoicePlaying, setNavVoicePlaying] = useState(false);
  const [promptViewMode, setPromptViewMode] = useState<'edit' | 'diff'>('edit');
  const [blueprintDrawerOpen, setBlueprintDrawerOpen] = useState(false);
  const [hoveredVersionBtn, setHoveredVersionBtn] = useState<'update' | 'save' | 'publish' | null>(null);
  const [selectedBlueprint, setSelectedBlueprint] = useState<typeof BLUEPRINTS[0] | null>(null);
  const [tempSelectedVoiceId, setTempSelectedVoiceId] = useState('');

  useEffect(() => {
    if (voiceModalOpen) {
      setTempSelectedVoiceId(selectedVoiceId);
    }
  }, [voiceModalOpen, selectedVoiceId]);

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

  useEffect(() => {
    if (!openVersionMenuId) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (!target.closest(`[data-version-menu-root="${openVersionMenuId}"]`)) {
        setOpenVersionMenuId(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenVersionMenuId(null);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openVersionMenuId]);

  useEffect(() => {
    if (!phoneDropdownOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (!target.closest('[data-phone-dropdown-root]')) {
        setPhoneDropdownOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPhoneDropdownOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [phoneDropdownOpen]);

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
      ? prompt !== selectedVersion.systemPrompt
      : prompt.trim().length > 0);
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
    ? `Draft · ${draftBaseLabel}`
    : isSelectedLive && selectedVersion
      ? `Live · ${selectedVersionLabel}`
      : selectedVersion
        ? `Viewing · ${selectedVersionLabel}`
        : 'New Agent';

  const previewVersions = versions.slice(0, VERSION_HISTORY_PREVIEW_LIMIT);
  const pinnedLiveVersion =
    !showAllVersions && liveVersion
      ? versions.find((version) => version.id === liveVersion.id) ??
        liveVersion
      : null;
  const shouldRenderPinnedLive =
    pinnedLiveVersion != null &&
    !previewVersions.some((version) => version.id === pinnedLiveVersion.id);

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

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;

    if (
      typeof globalThis !== 'undefined' &&
      'requestIdleCallback' in globalThis
    ) {
      idleId = (globalThis as unknown as {
        requestIdleCallback: (cb: () => void) => number;
      }).requestIdleCallback(() => preloadTestCallModal());
    } else {
      timeoutId = globalThis.setTimeout(() => preloadTestCallModal(), 1200);
    }

    return () => {
      if (
        idleId !== undefined &&
        typeof globalThis !== 'undefined' &&
        'cancelIdleCallback' in globalThis
      ) {
        (
          globalThis as unknown as {
            cancelIdleCallback: (id: number) => void;
          }
        ).cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, []);

  const loadData = useCallback(async (loadAllVersions = false) => {
    if (!activeOrgId) {
      setLoading(false);
      setAgent(null);
      setVersions([]);
      setPhones([]);
      setAllVersionsLoaded(false);
      setShowAllVersions(false);
      phonesLoadedOrgRef.current = undefined;
      return;
    }
    setPageError(null);
    setLoading(true);
    try {
      const shouldFetchVoices = !voicesLoadedRef.current;
      const shouldFetchPhones = phonesLoadedOrgRef.current !== activeOrgId;
      const [agentRes, versionsRes, voicesRes, phonesRes] = await Promise.all([
        apiCall(`/api/v1/agents/${agentId}`, { method: 'GET' }),
        apiCall(
          loadAllVersions
            ? `/api/v1/agents/${agentId}/versions`
            : `/api/v1/agents/${agentId}/versions?limit=${VERSION_HISTORY_PREVIEW_LIMIT}`,
          { method: 'GET' },
        ),
        shouldFetchVoices
          ? apiCall('/api/v1/voices', { method: 'GET' })
          : Promise.resolve(null),
        shouldFetchPhones
          ? apiCall('/api/v1/phone-numbers', { method: 'GET' })
          : Promise.resolve(null),
      ]);

      if (!agentRes.ok) {
        const txt = await agentRes.text();
        throw new Error(txt || agentRes.statusText);
      }
      if (voicesRes && !voicesRes.ok) {
        const txt = await voicesRes.text();
        throw new Error(txt || voicesRes.statusText);
      }
      if (phonesRes && !phonesRes.ok) {
        const txt = await phonesRes.text();
        throw new Error(txt || phonesRes.statusText);
      }
      if (!versionsRes.ok) {
        const txt = await versionsRes.text();
        throw new Error(txt || versionsRes.statusText);
      }

      const agentBody = (await agentRes.json()) as AgentDetail;
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
      if (voicesRes) {
        setVoices((await voicesRes.json()) as VoiceDto[]);
        voicesLoadedRef.current = true;
      }
      if (phonesRes) {
        setPhones((await phonesRes.json()) as PhoneDto[]);
        phonesLoadedOrgRef.current = activeOrgId;
      }
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
      setOpenVersionMenuId(null);
      setPreviewingVersion(null);
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
      setOpenVersionMenuId(null);
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
      model: source?.model ?? DEFAULT_LLM_MODEL,
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
      setOpenVersionMenuId(null);
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

  const onVoiceSelect = async (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    setVoiceModalOpen(false);
    setVoiceSearchQuery('');
    setVoiceSaveBusy(true);

    if (!selectedVersion || !activeOrgId) {
      if (!selectedVersion) {
        setToast('Voice selected for the next saved version.');
      }
      setVoiceSaveBusy(false);
      return;
    }

    try {
      const res = await apiCall(
        `/api/v1/agents/${agentId}/versions/${selectedVersion.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt: selectedVersion.systemPrompt,
            voiceId: voiceId,
            model: selectedVersion.model,
            temperature: selectedVersion.temperature,
            maxTokens: selectedVersion.maxTokens,
            firstMessage: selectedVersion.firstMessage,
            endCallPhrases: selectedVersion.endCallPhrases,
          }),
        },
      );

      if (!res.ok) {
        throw new Error(await res.text() || res.statusText);
      }

      const updated = (await res.json()) as AgentVersion;
      setVersions((current) =>
        current.map((v) => (v.id === updated.id ? updated : v))
      );
      if (agent && agent.currentVersion && agent.currentVersion.id === updated.id) {
        setAgent({
          ...agent,
          currentVersion: updated,
        });
      }
      setToast('Voice setting saved.');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setToast(`Failed to update voice: ${message}`);
    } finally {
      setVoiceSaveBusy(false);
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
      setOpenVersionMenuId(null);
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
  const selectedModelValue =
    selectedVersion?.model ?? liveVersion?.model ?? DEFAULT_LLM_MODEL;
  const llmOptions = modelOptionsFor(selectedModelValue);
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

  const playVoicePreview = async (voiceToPreview?: VoiceDto) => {
    const targetVoice = voiceToPreview ?? selectedVoice;
    if (!targetVoice) {
      setToast('Pick a voice to preview.');
      return;
    }

    const el = previewAudioRef.current;
    if (!el) {
      return;
    }

    // Ensure a prior preview does not continue playing underneath the next one.
    el.pause();
    el.currentTime = 0;

    setPreviewBusy(true);
    if (voiceToPreview) {
      setPlayingVoiceId(voiceToPreview.rimeVoiceId);
    } else {
      setNavVoicePlaying(true);
    }
    try {
      console.debug('[AgentEditor] Voice preview request', {
        selectedVoiceId: targetVoice.rimeVoiceId,
        rimeVoiceId: targetVoice.rimeVoiceId,
        voiceName: targetVoice.name,
      });
      const res = await apiCall('/api/v1/voices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: targetVoice.rimeVoiceId }),
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
      setPlayingVoiceId(null);
      setNavVoicePlaying(false);
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
        phonesLoadedOrgRef.current = activeOrgId;
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
      setOpenVersionMenuId(null);
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

  /* ─── Version row for sidebar history ─── */
  const renderVersionRow = (
    v: AgentVersion,
    options: { pinnedLive?: boolean } = {},
  ) => {
    const isSelected = selectedVersion?.id === v.id;
    const status = versionStatus(v, liveVersion, latestVersion);
    const timestamp = v.publishedAt ?? v.updatedAt ?? v.createdAt;

    return (
      <li
        key={options.pinnedLive ? `${v.id}-pinned` : v.id}
        className={cn(
          'group/version relative rounded-lg px-3 py-2 text-xs transition-all cursor-pointer',
          v.isLive
            ? 'bg-primary/[0.04] hover:bg-primary/[0.08]'
            : 'hover:bg-muted/60',
          isSelected && 'bg-muted/70 ring-1 ring-primary/20',
        )}
        onClick={() => setPreviewingVersion(v)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs leading-none">
                V{v.versionNumber}
              </span>
              <Badge
                variant={v.isLive ? 'default' : 'secondary'}
                className="text-[9px] px-1.5 py-0 h-[18px] font-medium"
              >
                {status}
              </Badge>
              {isSelected ? (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-[18px]">
                  Active
                </Badge>
              ) : null}
            </div>
            <span className="text-[10px] text-muted-foreground/70 mt-0.5 block">
              {safeRelativeTime(timestamp)}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="h-6 w-6 opacity-0 group-hover/version:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewingVersion(v);
              }}
              title="Preview version"
            >
              <Eye className="size-3" aria-hidden />
            </Button>
            <div className="relative shrink-0" data-version-menu-root={v.id}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="h-6 w-6 opacity-0 group-hover/version:opacity-100 transition-opacity"
                aria-label={`Actions for version ${v.versionNumber}`}
                aria-expanded={openVersionMenuId === v.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenVersionMenuId((current) => (current === v.id ? null : v.id));
                }}
              >
                <MoreVertical className="size-3" aria-hidden />
              </Button>
              {openVersionMenuId === v.id ? (
                <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg">
                  <VersionMenuButton
                    icon={GitCompare}
                    label="View diff"
                    disabled={versionPanelBusy || versionHistoryBusy}
                    onClick={() => {
                      setOpenVersionMenuId(null);
                      void openPromptDiff(v);
                    }}
                  />
                  <VersionMenuButton
                    icon={Rocket}
                    label="Publish live"
                    disabled={versionPanelBusy || v.isLive || hasUnsavedChanges}
                    onClick={() => {
                      setOpenVersionMenuId(null);
                      setPublishTarget(v);
                    }}
                  />
                  <VersionMenuButton
                    icon={RotateCcw}
                    label="Restore"
                    disabled={versionPanelBusy}
                    onClick={() => {
                      setOpenVersionMenuId(null);
                      setRestoreTarget(v);
                    }}
                  />
                  <VersionMenuButton
                    icon={Copy}
                    label="Duplicate"
                    disabled={versionPanelBusy || saveBusy !== null}
                    onClick={() => {
                      setOpenVersionMenuId(null);
                      void duplicateVersion(v);
                    }}
                  />
                  <VersionMenuButton
                    icon={Copy}
                    label="Copy prompt"
                    disabled={versionPanelBusy}
                    onClick={() => {
                      setOpenVersionMenuId(null);
                      void copyVersionPrompt(v);
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </li>
    );
  };



  if (!activeOrgId && !loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an organization first.
      </p>
    );
  }

  if (loading && !agent) {
    return <AgentEditorSkeleton />;
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
    <div className="-m-4 min-h-screen bg-background sm:-m-6">
      {/* Toast */}
      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[100] max-w-sm rounded-xl border border-border/80 bg-popover px-4 py-2.5 text-popover-foreground text-sm shadow-xl backdrop-blur"
        >
          {toast}
        </div>
      ) : null}

      {/* ═══════════════════════ HEADER NAVBAR ═══════════════════════ */}
      <div className="border-b border-border/40 bg-background/80 px-4 py-2 backdrop-blur-xl sm:px-6 sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          {/* Left: Back + Name + Status */}
          <div className="min-w-0 flex items-center gap-2.5">
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
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-8 w-8 shrink-0')}
              aria-label="Back to agents"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <h1 className="truncate font-semibold text-base tracking-tight">
              {agent.name}
            </h1>
            <Badge
              variant={agent.isActive ? 'default' : 'secondary'}
              className="h-5 text-[10px] px-2 shrink-0"
            >
              {agent.isActive ? 'Active' : 'Inactive'}
            </Badge>

            <span className="h-4 w-px bg-border/50 mx-1 hidden md:block" />

            {/* Voice Pill with Play + Settings */}
            <div className="hidden md:flex items-center gap-0.5 rounded-full border border-border/50 bg-muted/15 pl-1 pr-2.5 py-0.5 h-7">
              <button
                type="button"
                className="flex items-center justify-center h-5 w-5 rounded-full hover:bg-muted/60 transition-colors"
                title={selectedVoice ? `Play ${selectedVoice.name}` : 'Select a voice first'}
                disabled={!selectedVoiceId || previewBusy}
                onClick={() => void playVoicePreview()}
              >
                {previewBusy && navVoicePlaying ? (
                  <Loader2 className="size-3 animate-spin text-primary" />
                ) : navVoicePlaying ? (
                  <div className="flex items-end gap-[1.5px] h-3 px-0.5" title="Pause preview">
                    <style dangerouslySetInnerHTML={{__html: `
                      @keyframes eq-bar-1 { 0%, 100% { height: 4px; } 50% { height: 12px; } }
                      @keyframes eq-bar-2 { 0%, 100% { height: 12px; } 50% { height: 6.5px; } }
                      @keyframes eq-bar-3 { 0%, 100% { height: 6.5px; } 50% { height: 10px; } }
                      .eq-bar-1 { animation: eq-bar-1 0.8s ease-in-out infinite; }
                      .eq-bar-2 { animation: eq-bar-2 0.8s ease-in-out infinite; }
                      .eq-bar-3 { animation: eq-bar-3 0.8s ease-in-out infinite; }
                    `}} />
                    <span className="w-[1.5px] bg-primary rounded-full eq-bar-1" />
                    <span className="w-[1.5px] bg-primary rounded-full eq-bar-2" />
                    <span className="w-[1.5px] bg-primary rounded-full eq-bar-3" />
                  </div>
                ) : (
                  <Play className="size-2.5 text-muted-foreground fill-muted-foreground" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setVoiceModalOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary transition-colors"
              >
                <Volume2 className="size-3 text-muted-foreground" />
                <span className="max-w-[100px] truncate">{selectedVoice?.name ?? 'Voice'}</span>
              </button>
              <button
                type="button"
                onClick={() => setVoiceModalOpen(true)}
                className="flex items-center justify-center h-5 w-5 rounded-full hover:bg-muted/60 transition-colors ml-0.5"
                title="Voice settings"
              >
                <Settings2 className="size-3 text-muted-foreground" />
              </button>
            </div>

            {/* Phone Pill */}
            <div className="relative hidden md:inline-block" data-phone-dropdown-root>
              <button
                type="button"
                onClick={() => setPhoneDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/15 px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/30 h-7"
              >
                <span className="text-muted-foreground">📞</span>
                <span className="max-w-[100px] truncate">
                  {attachedPhones.length > 0 ? attachedPhones[0].number : 'No Phone'}
                </span>
              </button>
              {phoneDropdownOpen && (
                <div
                  className="absolute left-0 mt-1.5 z-50 w-64 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg focus-visible:outline-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                    Assign Phone Number
                  </p>
                  <select
                    className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={primaryAttachedId}
                    disabled={saveBusy === 'phone'}
                    onChange={(e) => {
                      void onPhoneRoutingChange(e.target.value);
                      setPhoneDropdownOpen(false);
                    }}
                  >
                    <option value="">None (unassigned)</option>
                    {phones.map((p) => {
                      const assignment =
                        p.agent && !p.agent.deletedAt
                          ? ` (-> ${p.agent.name})`
                          : '';
                      return (
                        <option key={p.id} value={p.id}>
                          {p.number}{assignment}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Right: Status + Test */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
              {hasUnsavedChanges && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              )}
              {editorStatusText}
            </span>
            {loading ? (
              <span className="hidden lg:inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Refreshing...
              </span>
            ) : null}
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 text-xs px-4 rounded-lg shadow-sm"
              disabled={!canTest}
              title={testCallBlockedReason ?? 'Run a browser preview.'}
              onMouseEnter={preloadTestCallModal}
              onFocus={preloadTestCallModal}
              onClick={() => setTestCallOpen(true)}
            >
              <Play className="size-3.5 mr-1.5 fill-current" aria-hidden />
              Test Agent
            </Button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {pageError ? (
        <div className="mx-auto max-w-[1500px] px-4 pt-4 sm:px-6">
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive text-sm">
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

      {/* ═══════════════════════ MAIN GRID ═══════════════════════ */}
      <div className="mx-auto grid max-w-[1500px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_300px] items-start">
        {/* ─── LEFT COLUMN: Prompt Workspace ─── */}
        <div className="flex flex-col min-w-0 gap-3 lg:sticky lg:top-[68px] z-10">
          {/* Minimal section header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold text-foreground tracking-tight">System Instructions</h2>
              {selectedVersion ? (
                <span className="text-[11px] text-muted-foreground">
                  {hasUnsavedChanges
                    ? `Editing from V${selectedVersion.versionNumber}`
                    : isSelectedLive
                      ? `Live V${selectedVersion.versionNumber}`
                      : `V${selectedVersion.versionNumber}`}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/20">
                <button
                  type="button"
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md transition-colors",
                    promptViewMode === 'edit'
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setPromptViewMode('edit')}
                >
                  Write
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md transition-colors",
                    promptViewMode === 'diff'
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  disabled={!selectedVersion}
                  onClick={() => setPromptViewMode('diff')}
                  title={selectedVersion ? "Compare changes with active version" : "No baseline version to compare"}
                >
                  Compare Diff
                </button>
              </div>

              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border/30 bg-background hover:bg-muted/50 transition-colors",
                  blueprintDrawerOpen && "border-primary/20 bg-primary/[0.03] text-primary"
                )}
                onClick={() => setBlueprintDrawerOpen((prev) => !prev)}
              >
                <Sparkles className="size-3 text-amber-500" />
                Blueprints
              </button>
            </div>
          </div>

          {/* Contextual alerts — kept slim */}
          {isSelectedLive && hasUnsavedChanges ? (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/15 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
              <AlertTriangle className="size-3.5 text-amber-500 shrink-0" aria-hidden />
              <span className="font-medium">Editing Live — saving will immediately affect active calls.</span>
            </div>
          ) : null}
          {isViewingHistoricalVersion ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted/30 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              <span>Viewing historical V{selectedVersion?.versionNumber}. Use <strong className="text-foreground">Restore</strong> to create a new draft from this version.</span>
            </div>
          ) : null}

          {/* The actual editor & blueprint drawer side-by-side */}
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              {promptHydrated ? (
                <AgentSystemPromptEditor
                  value={prompt}
                  onChange={setPrompt}
                  disabled={saveBusy !== null}
                  helperLabel={hasUnsavedChanges ? 'Draft changes saved locally' : undefined}
                  viewMode={promptViewMode}
                  oldValue={selectedVersion?.systemPrompt ?? ''}
                />
              ) : (
                <div className="h-[580px] rounded-xl border border-dashed border-border/40 bg-muted/10 flex-1 animate-pulse" />
              )}
            </div>

            {blueprintDrawerOpen && (
              <div className="w-[260px] h-[calc(100vh-130px)] min-h-[500px] shrink-0 flex flex-col rounded-xl border border-border/30 bg-background shadow-sm overflow-hidden animate-in slide-in-from-right duration-250">
                <div className="p-3.5 border-b border-border/20 bg-muted/[0.02] shrink-0">
                  <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-amber-500" />
                    Prompt Blueprints
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Click to insert pre-built prompt templates</p>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {BLUEPRINTS.map((bp) => (
                    <div
                      key={bp.id}
                      className="p-2.5 rounded-lg border border-transparent hover:bg-muted/50 transition-colors cursor-pointer group"
                      onClick={() => {
                        setSelectedBlueprint(bp);
                      }}
                    >
                      <h4 className="text-[11px] font-semibold text-foreground group-hover:text-primary transition-colors">
                        {bp.name}
                      </h4>
                      <p className="text-[9px] text-muted-foreground line-clamp-3 mt-0.5 leading-relaxed">
                        {bp.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT COLUMN: Version Control Center ─── */}
        <div className="space-y-5 lg:self-start lg:sticky lg:top-[60px]">
          {/* Voice Pipeline */}
          <div className="rounded-xl border border-border/50 bg-muted/[0.03] p-4 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Settings2 className="size-3 text-muted-foreground" />
                Voice Pipeline
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Configure the voice and model stack after creating the agent.
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-border/40 bg-background/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Voice
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">
                      {(selectedVoice?.name ?? selectedVoiceId) || 'Choose a voice'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {selectedVoice
                        ? selectedVoice.rimeVoiceId
                        : 'Required before saving or publishing a version.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 text-xs"
                    disabled={saveBusy !== null || voiceSaveBusy}
                    onClick={() => setVoiceModalOpen(true)}
                  >
                    {selectedVoiceId ? 'Change' : 'Choose'}
                  </Button>
                </div>
              </div>

              <PipelineSelect
                label="TTS"
                value={TTS_OPTIONS[0].value}
                options={TTS_OPTIONS}
                note="Only one TTS provider is available right now."
              />
              <PipelineSelect
                label="STT"
                value={STT_OPTIONS[0].value}
                options={STT_OPTIONS}
                note="Only one STT provider is available right now."
              />
              <PipelineSelect
                label="LLM"
                value={selectedModelValue}
                options={llmOptions}
                note="Only one model is available right now."
              />
            </div>
          </div>

          {/* Version Actions Card */}
          <div className="rounded-xl border border-border/50 bg-muted/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Rocket className="size-3 text-muted-foreground" />
                Version Control
              </h3>
              
              {/* Pulse status indicator */}
              <div className="flex items-center gap-1.5">
                {selectedVersion && (
                  <>
                    <span className="relative flex h-2 w-2">
                      {isSelectedLive && !hasUnsavedChanges ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </>
                      ) : hasUnsavedChanges ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </>
                      ) : (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </>
                      )}
                    </span>
                    <Badge
                      variant={hasUnsavedChanges ? 'outline' : isSelectedLive ? 'default' : 'secondary'}
                      className="text-[9px] px-1.5 h-[18px]"
                    >
                      {hasUnsavedChanges
                        ? 'Draft'
                        : isSelectedLive
                          ? 'Live'
                          : `V${selectedVersion.versionNumber}`}
                    </Badge>
                  </>
                )}
              </div>
            </div>

            {/* Status line */}
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {hasUnsavedChanges
                ? `Unsaved changes based on ${draftBaseLabel}`
                : isSelectedLive && selectedVersion
                  ? `V${selectedVersion.versionNumber} is live and serving active calls`
                  : selectedVersion
                    ? `Viewing V${selectedVersion.versionNumber}`
                    : 'No versions yet — write a prompt to begin'}
            </p>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {canPublishLive && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="w-full h-9 text-xs font-semibold rounded-lg transition-all"
                  onMouseEnter={() => {
                    if (canPublishLive) {
                      setHoveredVersionBtn('publish');
                    }
                  }}
                  onMouseLeave={() => setHoveredVersionBtn(null)}
                  onClick={() => selectedVersion && setPublishTarget(selectedVersion)}
                >
                  <Rocket className="size-3.5 mr-1.5" aria-hidden />
                  Publish Live
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-[11px] px-2.5 rounded-lg transition-all"
                  disabled={!canUpdateCurrentVersion}
                  onMouseEnter={() => {
                    if (canUpdateCurrentVersion) {
                      setHoveredVersionBtn('update');
                    }
                  }}
                  onMouseLeave={() => setHoveredVersionBtn(null)}
                  onClick={() => void updateCurrentVersionFlow()}
                >
                  {saveBusy === 'update' ? (
                    <Loader2 className="size-3 animate-spin mr-1" />
                  ) : (
                    <Save className="size-3 mr-1" aria-hidden />
                  )}
                  Update
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1 h-8 text-[11px] px-2.5 rounded-lg transition-all"
                  disabled={!canCreateNewVersion}
                  onMouseEnter={() => {
                    if (canCreateNewVersion) {
                      setHoveredVersionBtn('save');
                    }
                  }}
                  onMouseLeave={() => setHoveredVersionBtn(null)}
                  onClick={() => void createVersionFlow()}
                >
                  {saveBusy === 'create' ? (
                    <Loader2 className="size-3 animate-spin mr-1" />
                  ) : (
                    <Plus className="size-3 mr-1" aria-hidden />
                  )}
                  Save V{nextVersionNumber}
                </Button>
              </div>
            </div>

            {/* Hover explanation block */}
            <div className={cn(
              "pt-2 pb-0.5 border-t border-border/10 flex items-start gap-2 text-[10px] text-muted-foreground/80 min-h-[38px] leading-normal select-none transition-all duration-200",
              hoveredVersionBtn ? "opacity-100" : "opacity-0 pointer-events-none"
            )}>
              <Info className="size-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
              <p className="flex-1">
                {hoveredVersionBtn === 'publish' && "Publish Live: Activates this version for all phone routing. Changes take effect instantly."}
                {hoveredVersionBtn === 'update' && "Update: Saves edits directly into the selected version without creating a new checkpoint."}
                {hoveredVersionBtn === 'save' && `Save V${nextVersionNumber}: Creates a new separate version checkpoint. You can review or revert to this point later.`}
              </p>
            </div>
          </div>

          {/* Version History */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <History className="size-3" />
                History
              </h3>
              {liveVersion && (
                <span className="text-[10px] text-muted-foreground">
                  Live: V{liveVersion.versionNumber}
                </span>
              )}
            </div>
            {versions.length > 0 ? (
              <div className="space-y-1.5">
                <ul className="space-y-0.5">
                  {versions.slice(0, VERSION_HISTORY_PREVIEW_LIMIT).map((v) => renderVersionRow(v))}
                </ul>

                {shouldRenderPinnedLive && pinnedLiveVersion ? (
                  <div className="space-y-0.5 pt-1.5 border-t border-border/20">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-1 py-0.5">
                      Live Version
                    </p>
                    <ul className="space-y-0.5">
                      {renderVersionRow(pinnedLiveVersion, {
                        pinnedLive: true,
                      })}
                    </ul>
                  </div>
                ) : null}

                {/* Footer link */}
                <div className="pt-1.5 border-t border-border/20">
                  <button
                    type="button"
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    disabled={versionHistoryBusy}
                    onClick={async () => {
                      if (!allVersionsLoaded) {
                        await loadFullVersionHistory();
                      }
                      setFullHistoryOpen(true);
                    }}
                  >
                    {versionHistoryBusy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                    View full history
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border/40 p-4 text-center text-muted-foreground text-xs">
                No versions yet. Write a prompt and save V1.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Hidden audio element */}
      <audio ref={previewAudioRef} className="hidden" preload="none" />

      {/* ═══════════════════════ DIALOGS ═══════════════════════ */}

      {/* Prompt Diff */}
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

      {/* Restore Confirm */}
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

      {/* Tiny Change Warning */}
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

      {/* Publish Confirm */}
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

      {/* Blueprint Preview Dialog */}
      <Dialog
        open={selectedBlueprint !== null}
        onOpenChange={(next) => {
          if (!next) {
            setSelectedBlueprint(null);
          }
        }}
      >
        {selectedBlueprint ? (
          <DialogContent className="max-h-[85vh] w-[min(640px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden sm:max-w-none flex flex-col p-0 rounded-2xl border border-border/80 shadow-2xl">
            <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0">
              <DialogTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                <Sparkles className="size-4 text-amber-500" />
                Blueprint: {selectedBlueprint.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1.5">
                {selectedBlueprint.description}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prompt Template</p>
              <div className="rounded-lg border border-border/30 bg-muted/[0.03] p-4 h-[calc(100%-20px)] overflow-y-auto">
                <pre className="whitespace-pre-wrap text-[13px] leading-[1.8] text-foreground font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
                  {selectedBlueprint.template}
                </pre>
              </div>
            </div>

            <DialogFooter className="px-6 py-3 border-t border-border/40 bg-muted/[0.02] flex items-center justify-end gap-2.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs px-4"
                onClick={() => setSelectedBlueprint(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 text-xs px-4 bg-primary text-primary-foreground hover:bg-primary/95"
                onClick={() => {
                  setPrompt(selectedBlueprint.template);
                  setPromptViewMode('edit');
                  setSelectedBlueprint(null);
                  setToast(`Applied ${selectedBlueprint.name} blueprint.`);
                }}
              >
                Use This Prompt
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* Voice Selector Modal */}
      <Dialog
        open={voiceModalOpen}
        onOpenChange={(next) => {
          if (!next) {
            setVoiceModalOpen(false);
            setVoiceSearchQuery('');
          }
        }}
      >
        <DialogContent className="max-h-[80vh] w-[min(480px,calc(100vw-2rem))] max-w-none gap-4 overflow-hidden sm:max-w-none flex flex-col p-6 rounded-2xl border border-border/80 shadow-2xl">
          <DialogHeader className="pb-2 border-b border-border/40">
            <DialogTitle className="text-lg font-semibold tracking-tight">Select Agent Voice</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Choose the voice your assistant will use. Search from our list of available voices.
            </DialogDescription>
          </DialogHeader>

          {/* Search box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search voices by name or ID..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={voiceSearchQuery}
              onChange={(e) => setVoiceSearchQuery(e.target.value)}
            />
          </div>

          {/* Scrollable voice list */}
          <div className="flex-1 overflow-y-auto min-h-0 pr-1 py-1 space-y-1">
            {voices
              .filter((v) => {
                const q = voiceSearchQuery.toLowerCase();
                return v.name.toLowerCase().includes(q) || v.rimeVoiceId.toLowerCase().includes(q);
              })
              .map((v) => {
                const isTempSelected = tempSelectedVoiceId === v.rimeVoiceId;
                const isPlaying = playingVoiceId === v.rimeVoiceId;
                return (
                  <div
                    key={v.id}
                    className={cn(
                      "flex items-center justify-between gap-3 p-2 rounded-lg border transition-all cursor-pointer",
                      isTempSelected 
                        ? "bg-primary/[0.06] border-primary/20 shadow-sm" 
                        : "border-transparent hover:bg-muted/40"
                    )}
                    onClick={() => setTempSelectedVoiceId(v.rimeVoiceId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Button
                        type="button"
                        size="icon-xs"
                        variant={isPlaying ? "default" : "outline"}
                        className="rounded-full shrink-0 h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          void playVoicePreview(v);
                        }}
                        disabled={previewBusy && !isPlaying}
                      >
                        {isPlaying ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Play className="size-3 text-muted-foreground fill-muted-foreground" />
                        )}
                      </Button>
                      <div className="min-w-0">
                        <p className="font-semibold text-xs truncate">{v.name}</p>
                        <p className="text-[9px] text-muted-foreground truncate">{v.rimeVoiceId}</p>
                      </div>
                    </div>
                    {isTempSelected ? (
                      <span className="text-[10px] font-semibold text-primary px-2 py-1 rounded-full bg-primary/10 border border-primary/20 flex items-center gap-1 shrink-0">
                        <Check className="size-3 text-primary" aria-hidden />
                        Selected
                      </span>
                    ) : null}
                  </div>
                );
              })}
            {voices.filter((v) => {
              const q = voiceSearchQuery.toLowerCase();
              return v.name.toLowerCase().includes(q) || v.rimeVoiceId.toLowerCase().includes(q);
            }).length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-8">No voices match your search.</p>
            )}
          </div>

          <DialogFooter className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {voices.length} voices available
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setVoiceModalOpen(false);
                  setVoiceSearchQuery('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 text-xs px-4"
                disabled={!tempSelectedVoiceId || voiceSaveBusy}
                onClick={() => {
                  void onVoiceSelect(tempSelectedVoiceId);
                }}
              >
                {voiceSaveBusy ? 'Saving...' : 'Select Voice'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ VERSION PREVIEW MODAL ═══════════════ */}
      <Dialog
        open={previewingVersion !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPreviewingVersion(null);
          }
        }}
      >
        {previewingVersion ? (
          <DialogContent
            showCloseButton
            className="max-h-[85vh] w-[min(640px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden sm:max-w-none flex flex-col p-0 rounded-2xl"
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-border/40">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <DialogTitle className="text-base font-semibold tracking-tight">
                    Version {previewingVersion.versionNumber}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-1">
                    {previewingVersion.isLive ? 'Currently live' : 'Saved snapshot'} · Created {safeRelativeTime(previewingVersion.createdAt)}
                  </DialogDescription>
                </div>
                <Badge
                  variant={previewingVersion.isLive ? 'default' : 'secondary'}
                  className="text-[10px] px-2 h-5"
                >
                  {versionStatus(previewingVersion, liveVersion, latestVersion)}
                </Badge>
              </div>
              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Volume2 className="size-3" />
                  {voices.find((v) => v.rimeVoiceId === previewingVersion.voiceId)?.name ?? previewingVersion.voiceId}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {safeRelativeTime(previewingVersion.updatedAt)}
                </span>
                {previewingVersion.publishedAt && (
                  <span className="flex items-center gap-1">
                    <Rocket className="size-3" />
                    Published {safeRelativeTime(previewingVersion.publishedAt)}
                  </span>
                )}
              </div>
            </div>

            {/* Prompt body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">System Prompt</p>
              <div className="rounded-lg border border-border/30 bg-muted/[0.03] p-4">
                <pre className="whitespace-pre-wrap text-[13px] leading-[1.8] text-foreground font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
                  {previewingVersion.systemPrompt}
                </pre>
              </div>
            </div>

            {/* Actions footer */}
            <div className="px-6 py-3 border-t border-border/40 bg-muted/[0.02] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => {
                    void copyVersionPrompt(previewingVersion);
                  }}
                >
                  <Copy className="size-3" />
                  Copy
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={versionPanelBusy || versionHistoryBusy}
                  onClick={() => {
                    setPreviewingVersion(null);
                    void openPromptDiff(previewingVersion);
                  }}
                >
                  <GitCompare className="size-3" />
                  Compare
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {!previewingVersion.isLive && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    disabled={versionPanelBusy || hasUnsavedChanges}
                    onClick={() => {
                      setPreviewingVersion(null);
                      setPublishTarget(previewingVersion);
                    }}
                  >
                    <Rocket className="size-3" />
                    Publish
                  </Button>
                )}
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => {
                    loadVersionIntoEditor(previewingVersion);
                  }}
                >
                  <RotateCcw className="size-3" />
                  Load in Editor
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* ═══════════════ FULL VERSION HISTORY MODAL ═══════════════ */}
      <Dialog
        open={fullHistoryOpen}
        onOpenChange={(next) => {
          if (!next) {
            setFullHistoryOpen(false);
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="max-h-[85vh] w-[min(700px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden sm:max-w-none flex flex-col p-0 rounded-2xl"
        >
          <div className="px-6 pt-5 pb-4 border-b border-border/40">
            <DialogTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
              <History className="size-4" />
              Version History
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {versions.length} version{versions.length !== 1 ? 's' : ''} · Click any version to preview
            </DialogDescription>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-2">
            {versions.length > 0 ? (
              <div className="space-y-0.5">
                {versions.map((v) => {
                  const isSelected = selectedVersion?.id === v.id;
                  const status = versionStatus(v, liveVersion, latestVersion);
                  const timestamp = v.publishedAt ?? v.updatedAt ?? v.createdAt;
                  const voiceName = voices.find((voice) => voice.rimeVoiceId === v.voiceId)?.name ?? v.voiceId;

                  return (
                    <button
                      type="button"
                      key={v.id}
                      className={cn(
                        'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-left transition-all',
                        'hover:bg-muted/60',
                        v.isLive && 'bg-primary/[0.04]',
                        isSelected && 'ring-1 ring-primary/20 bg-muted/50',
                      )}
                      onClick={() => {
                        setFullHistoryOpen(false);
                        setPreviewingVersion(v);
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-semibold text-sm tabular-nums shrink-0 w-8">
                          V{v.versionNumber}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant={v.isLive ? 'default' : 'secondary'}
                              className="text-[9px] px-1.5 py-0 h-[18px]"
                            >
                              {status}
                            </Badge>
                            {isSelected && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-[18px]">
                                Active in Editor
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {voiceName} · {safeRelativeTime(timestamp)}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground/50 shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-12">No versions found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentEditorSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[540px] w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}

function PipelineSelect({
  label,
  value,
  options,
  note,
}: {
  label: string;
  value: string;
  options: readonly PipelineOption[];
  note: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        className="mt-1 h-9 w-full cursor-not-allowed rounded-lg border border-border/50 bg-background/70 px-2.5 text-xs font-medium text-foreground shadow-sm outline-none disabled:opacity-100"
        value={value}
        disabled
        aria-label={`${label} provider`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
        {note}
      </span>
    </label>
  );
}

function modelOptionsFor(value: string): PipelineOption[] {
  if (LLM_OPTIONS.some((option) => option.value === value)) {
    return [...LLM_OPTIONS];
  }
  return [{ value, label: `Current model - ${value}` }];
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
        onClick();
        const menuRoot = event.currentTarget.closest('[data-version-menu-root]');
        if (menuRoot instanceof HTMLElement) {
          menuRoot.focus?.();
        }
      }}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
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
    return 'Live';
  }
  if (latestVersion?.id === version.id) {
    return 'Draft';
  }
  return 'Saved';
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
