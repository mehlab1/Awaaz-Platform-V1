'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import dynamic from 'next/dynamic';
import Image from 'next/image';
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
  Search,
  Settings2,
  Sparkles,
  type LucideIcon,
  Volume2,
} from 'lucide-react';
import useLocalStorageState from 'use-local-storage-state';

import { AgentSystemPromptEditor } from '@/components/agent-system-prompt-editor';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/custom-select';
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

const VOICE_PROVIDERS = [
  { id: 'rime', label: 'Rime' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'cartesia', label: 'Cartesia' },
  { id: 'fish-audio', label: 'Fish Audio' },
  { id: 'future', label: 'Future providers' },
] as const;

type VoiceProviderId = (typeof VOICE_PROVIDERS)[number]['id'];

const VOICE_AVATAR_COUNTS = {
  female: 12,
  male: 12,
  neutral: 6,
} as const;

type VoiceAvatarFolder = keyof typeof VOICE_AVATAR_COUNTS;

const STT_OPTIONS = [
  { value: 'deepgram', label: 'Deepgram STT' },
] as const;

const VOICE_PREVIEW_FALLBACK_TEXT = 'Hi, I am Awaaz’s voice agent.';

const BLUEPRINTS = [
  {
    id: 'support',
    name: 'Customer Support',
    description: 'Friendly agent focused on answering questions, billing help, and graceful human escalation.',
    template: `You are a customer support specialist for Acme Corp. Your job is to resolve issues quickly, clearly, and with a calm professional tone.

## Primary Objectives
1. Understand the customer’s issue, confirm the relevant account, order, or service details, and identify the root cause.
2. Provide the simplest correct answer or troubleshooting path first.
3. Keep the customer informed about what you are doing and what will happen next.
4. Escalate to a human agent only when the customer asks for one or when the issue is still unresolved after 3 clear attempts.

## Support Workflow
1. Greet the customer politely and acknowledge the issue.
2. Ask only the minimum questions needed to diagnose the problem.
3. If troubleshooting is needed, guide the customer one step at a time.
4. Confirm whether the issue is resolved before ending the conversation.
5. If you must escalate, summarize the problem, the actions already taken, and any important account details so the handoff is smooth.

## Response Style
- Be concise, but do not sacrifice clarity.
- Use plain language and avoid jargon unless the customer already used it.
- Stay empathetic, calm, and solution-oriented.
- Never sound dismissive, defensive, or overly scripted.

## Guardrails
- Do not invent policies, refunds, credits, or technical details.
- Do not promise actions you cannot take.
- If information is missing, ask one focused question at a time.
- If the customer is frustrated, acknowledge the frustration before moving into troubleshooting.`
  },
  {
    id: 'scheduler',
    name: 'Appointment Booking',
    description: 'Dental/medical scheduling assistant collecting preferred days, times, and customer info.',
    template: `You are a scheduling assistant for Dr. Smith's Dental Office. Your role is to book appointments accurately, collect the right details, and make the process feel easy and professional.

## Primary Objectives
1. Help the patient schedule a checkup, cleaning, follow-up, or urgent visit.
2. Collect the information needed to complete the booking without overwhelming the patient.
3. Match the appointment to the patient’s preferred day, time, and visit type whenever possible.
4. Confirm the appointment details clearly before ending the conversation.

## Scheduling Workflow
1. Ask what type of appointment the patient needs.
2. Ask for their preferred day range and time window, such as morning or afternoon.
3. Confirm the patient’s full name and best callback number.
4. Ask for a short reason for the visit so the office can prepare appropriately.
5. If the patient mentions pain, swelling, bleeding, or other urgent symptoms, treat it as time-sensitive and prioritize faster scheduling guidance.
6. Recap the appointment details before closing.

## Response Style
- Be warm, structured, and efficient.
- Use short, clear questions.
- Keep the tone reassuring and professional.
- Make it easy for the patient to answer one step at a time.

## Guardrails
- Do not diagnose medical issues.
- Do not promise a specific provider or time slot unless it has been confirmed.
- If the patient needs urgent medical attention, advise them to seek immediate care through the appropriate emergency channel.`
  },
  {
    id: 'qualifier',
    name: 'Sales Lead Qualifier',
    description: 'Persuasive outbound agent qualifying leads based on volume, timeline, and decision power.',
    template: `You are an outbound sales development representative for Awaaz AI. Your job is to qualify leads, identify fit, and move strong opportunities to the next step without wasting the prospect’s time.

## Primary Objectives
1. Determine whether the lead is a good fit based on call volume, timeline, and decision-making authority.
2. Understand the prospect’s current process, pain points, and what success would look like.
3. If the lead is qualified, secure the next step, ideally a product demo.
4. If the lead is not a fit, end politely and leave the conversation with a positive impression.

## Qualification Flow
1. Open with a brief, confident introduction and explain why you are calling.
2. Ask about current call volume and the team’s current workflow.
3. Ask when they are planning to evaluate or adopt a solution.
4. Ask who is involved in the decision and whether the person on the call has decision-making authority.
5. If relevant, ask about pain points, current tools, and what is not working today.
6. If the prospect meets the qualification criteria, offer to book a demo and confirm the best time.

## Qualification Criteria
- Strong fit: more than 100 calls per day, timeline under 1 month, and a decision-maker or direct stakeholder on the call.
- Medium fit: useful pain but unclear timing or authority.
- Poor fit: no clear need, no urgency, or no path to decision.

## Response Style
- Be energetic, confident, and persuasive without sounding pushy.
- Keep questions crisp and purposeful.
- Mirror the prospect’s pace while staying in control of the conversation.
- Focus on business outcomes, not product jargon.

## Guardrails
- Do not overstate results or guarantees.
- Do not pressure the prospect into a demo if the fit is weak.
- If the prospect is not qualified, end respectfully and leave the door open for future follow-up.`
  },
  {
    id: 'screener',
    name: 'Interview Screener',
    description: 'HR recruiter screening candidates on experience, salary expectation, and start date.',
    template: `You are an HR recruiter screening candidates for the Software Engineer role. Your job is to collect the essential screening details in a professional, organized, and respectful way.

## Primary Objectives
1. Verify the candidate’s relevant experience with React, Node.js, and related software engineering work.
2. Confirm salary expectations, notice period, and earliest available start date.
3. Understand availability for a technical interview and next-step scheduling.
4. Capture a clear screening summary for the hiring team.

## Screening Workflow
1. Introduce yourself and explain that this is a short screening conversation.
2. Ask the candidate to summarize their background and recent experience.
3. Ask targeted follow-up questions about React, Node.js, and any other relevant technical experience.
4. Confirm compensation expectations and notice period.
5. Ask about interview availability and preferred next steps.
6. End with a brief recap of the candidate’s fit and the information collected.

## Response Style
- Be welcoming, professional, and neutral.
- Ask one question at a time and keep the conversation easy to follow.
- Stay objective and focus on facts.
- Keep the interaction efficient but not abrupt.

## Guardrails
- Do not make hiring decisions or promise an interview outcome.
- Do not discuss protected characteristics or irrelevant personal details.
- Do not exaggerate the role, compensation, or timeline.
- If the candidate asks for next steps, answer clearly and accurately.`
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
  provider?: string | null;
  description?: string | null;
  language?: string | null;
  gender?: string | null;
  previewAudioUrl: string | null;
  previewPlaybackUrl?: string | null;
  previewPlaybackExpiresInSeconds?: number | null;
  lang?: string | null;
  modelId?: string | null;
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
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const previewInFlightRef = useRef<Map<string, Promise<string>>>(new Map());
  const preloadedVoiceKeysRef = useRef<Set<string>>(new Set());
  const previewPlayRequestRef = useRef(0);
  const voiceListRef = useRef<HTMLDivElement | null>(null);
  const voiceRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
  const [loadingPreviewKey, setLoadingPreviewKey] = useState<string | null>(null);
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
  const [selectedVoiceProvider, setSelectedVoiceProvider] =
    useState<VoiceProviderId>('rime');
  const [voiceGenderFilter, setVoiceGenderFilter] = useState('all');
  const [voiceAccentFilter, setVoiceAccentFilter] = useState('all');
  const [voiceTypeFilter, setVoiceTypeFilter] = useState('all');
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
      const currentVoice = voices.find((voice) => voice.rimeVoiceId === selectedVoiceId);
      setTempSelectedVoiceId(selectedVoiceId);
      setSelectedVoiceProvider(voiceProviderId(currentVoice));
      setVoiceGenderFilter('all');
      setVoiceAccentFilter('all');
      setVoiceTypeFilter('all');
    }
  }, [voiceModalOpen, selectedVoiceId, voices]);

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

  const disposePreviewCache = useCallback(() => {
    previewPlayRequestRef.current += 1;
    previewAudioRef.current?.pause();
    for (const objectUrl of previewCacheRef.current.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    previewCacheRef.current.clear();
    previewInFlightRef.current.clear();
    preloadedVoiceKeysRef.current.clear();
  }, []);

  useEffect(() => disposePreviewCache, [disposePreviewCache]);

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

  const selectedVoice = useMemo(
    () => voices.find((v) => v.rimeVoiceId === selectedVoiceId),
    [selectedVoiceId, voices],
  );
  const tempSelectedVoice = useMemo(
    () => voices.find((v) => v.rimeVoiceId === tempSelectedVoiceId),
    [tempSelectedVoiceId, voices],
  );
  const selectedPanelVoice = tempSelectedVoice ?? selectedVoice ?? null;
  const selectedPanelProviderLabel = selectedPanelVoice
    ? voiceProviderLabel(voiceProviderId(selectedPanelVoice))
    : voiceProviderLabel(selectedVoiceProvider);
  const voiceProviderCounts = useMemo(() => {
    const counts = Object.fromEntries(
      VOICE_PROVIDERS.map((provider) => [provider.id, 0]),
    ) as Record<VoiceProviderId, number>;
    for (const voice of voices) {
      counts[voiceProviderId(voice)] += 1;
    }
    return counts;
  }, [voices]);
  const providerVoices = useMemo(
    () =>
      voices.filter(
        (voice) => voiceProviderId(voice) === selectedVoiceProvider,
      ),
    [selectedVoiceProvider, voices],
  );
  const filteredVoices = useMemo(
    () =>
      providerVoices.filter((voice) =>
        voiceMatchesFilters(
          voice,
          voiceSearchQuery,
          voiceGenderFilter,
          voiceAccentFilter,
          voiceTypeFilter,
        ),
      ),
    [
      providerVoices,
      voiceAccentFilter,
      voiceGenderFilter,
      voiceSearchQuery,
      voiceTypeFilter,
    ],
  );
  const voiceGenderOptions = useMemo(
    () =>
      uniqueVoiceFilterOptions(
        providerVoices.map((voice) => voiceGenderLabel(voice)),
      ),
    [providerVoices],
  );
  const voiceAccentOptions = useMemo(
    () =>
      uniqueVoiceFilterOptions(
        providerVoices.map((voice) => voiceAccentLabel(voice)),
      ),
    [providerVoices],
  );
  const voiceTypeOptions = useMemo(
    () =>
      uniqueVoiceFilterOptions(
        providerVoices.map((voice) => voiceTypeLabel(voice)),
      ),
    [providerVoices],
  );
  const selectedVoicePreviewKey = selectedVoice
    ? voicePreviewCacheKey(selectedVoice)
    : null;
  const selectedVoicePreviewLoading =
    selectedVoicePreviewKey !== null && loadingPreviewKey === selectedVoicePreviewKey;
  const selectedPanelPreviewKey = selectedPanelVoice
    ? voicePreviewCacheKey(selectedPanelVoice)
    : null;
  const selectedPanelPreviewLoading =
    selectedPanelPreviewKey !== null && loadingPreviewKey === selectedPanelPreviewKey;
  const selectedPanelPlaying =
    selectedPanelVoice !== null && playingVoiceId === selectedPanelVoice.rimeVoiceId;
  const selectedModelValue =
    selectedVersion?.model ?? liveVersion?.model ?? DEFAULT_LLM_MODEL;
  const llmOptions = modelOptionsFor(selectedModelValue);
  const hasUsableLiveConfig =
    liveVersion != null &&
    liveVersion.systemPrompt.trim().length > 0 &&
    liveVersion.voiceId.trim().length > 0;

  useEffect(() => {
    if (!voiceModalOpen) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      if (!tempSelectedVoiceId) {
        if (voiceListRef.current) {
          voiceListRef.current.scrollTop = 0;
        }
        return;
      }

      const selectedRow = voiceRowRefs.current.get(tempSelectedVoiceId);
      if (!selectedRow) {
        if (voiceListRef.current) {
          voiceListRef.current.scrollTop = 0;
        }
        return;
      }

      selectedRow.scrollIntoView({ block: 'center' });
      selectedRow.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    filteredVoices.length,
    selectedVoiceProvider,
    tempSelectedVoiceId,
    voiceAccentFilter,
    voiceGenderFilter,
    voiceModalOpen,
    voiceSearchQuery,
    voiceTypeFilter,
  ]);

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

  const preloadStoredVoicePreviewObjectUrl = useCallback(
    async (voice: VoiceDto): Promise<void> => {
      const cacheKey = voicePreviewCacheKey(voice);
      if (previewCacheRef.current.has(cacheKey)) {
        return;
      }

      const storedUrl = storedVoicePreviewUrl(voice);
      if (!storedUrl) {
        return;
      }

      const objectUrl = await fetchStoredVoicePreviewObjectUrl(storedUrl);
      if (previewCacheRef.current.has(cacheKey)) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      previewCacheRef.current.set(cacheKey, objectUrl);
    },
    [],
  );

  const getVoicePreviewObjectUrl = useCallback(
    async (voice: VoiceDto): Promise<string> => {
      const cacheKey = voicePreviewCacheKey(voice);
      const cached = previewCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      const inFlight = previewInFlightRef.current.get(cacheKey);
      if (inFlight) {
        return inFlight;
      }

      const request = (async () => {
        const storedUrl = storedVoicePreviewUrl(voice);
        if (storedUrl) {
          try {
            const objectUrl = await fetchStoredVoicePreviewObjectUrl(storedUrl);
            previewCacheRef.current.set(cacheKey, objectUrl);
            return objectUrl;
          } catch (e) {
            console.warn('[AgentEditor] Stored voice preview failed; using live fallback', {
              voiceId: voice.rimeVoiceId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        const res = await apiCall('/api/v1/voices/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voiceId: voice.rimeVoiceId }),
        });
        if (!res.ok) {
          throw new Error(await readApiError(res));
        }

        const audioBlob = await res.blob();
        const objectUrl = URL.createObjectURL(audioBlob);
        previewCacheRef.current.set(cacheKey, objectUrl);
        return objectUrl;
      })();

      previewInFlightRef.current.set(cacheKey, request);
      try {
        return await request;
      } finally {
        previewInFlightRef.current.delete(cacheKey);
      }
    },
    [apiCall],
  );

  useEffect(() => {
    if (!voiceModalOpen || voiceSearchQuery.trim()) {
      return undefined;
    }

    const unique = new Map<string, VoiceDto>();
    if (selectedVoice) {
      unique.set(selectedVoice.rimeVoiceId, selectedVoice);
    }
    for (const voice of voices) {
      unique.set(voice.rimeVoiceId, voice);
      if (unique.size >= 3) {
        break;
      }
    }

    const candidates = [...unique.values()].filter((voice) => {
      const cacheKey = voicePreviewCacheKey(voice);
      return (
        storedVoicePreviewUrl(voice) !== null &&
        !previewCacheRef.current.has(cacheKey) &&
        !previewInFlightRef.current.has(cacheKey) &&
        !preloadedVoiceKeysRef.current.has(cacheKey)
      );
    });

    if (candidates.length === 0) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      for (const voice of candidates) {
        const cacheKey = voicePreviewCacheKey(voice);
        preloadedVoiceKeysRef.current.add(cacheKey);
        void preloadStoredVoicePreviewObjectUrl(voice).catch(() => {
          preloadedVoiceKeysRef.current.delete(cacheKey);
        });
      }
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [
    preloadStoredVoicePreviewObjectUrl,
    selectedVoice,
    voiceModalOpen,
    voiceSearchQuery,
    voices,
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

    const cacheKey = voicePreviewCacheKey(targetVoice);
    const playRequestId = previewPlayRequestRef.current + 1;
    previewPlayRequestRef.current = playRequestId;

    el.pause();
    el.currentTime = 0;
    setPlayingVoiceId(null);
    setNavVoicePlaying(false);

    if (!previewCacheRef.current.has(cacheKey)) {
      setLoadingPreviewKey(cacheKey);
    }

    try {
      console.debug('[AgentEditor] Voice preview request', {
        selectedVoiceId: targetVoice.rimeVoiceId,
        rimeVoiceId: targetVoice.rimeVoiceId,
        voiceName: targetVoice.name,
        previewText: voicePreviewText(targetVoice),
        stored: storedVoicePreviewUrl(targetVoice) !== null,
        cached: previewCacheRef.current.has(cacheKey),
      });
      const nextUrl = await getVoicePreviewObjectUrl(targetVoice);
      if (playRequestId !== previewPlayRequestRef.current) {
        return;
      }

      if (el.src !== nextUrl) {
        el.src = nextUrl;
      }
      el.currentTime = 0;
      el.playbackRate = 1;
      await el.play();
      if (playRequestId !== previewPlayRequestRef.current) {
        return;
      }
      if (voiceToPreview) {
        setPlayingVoiceId(targetVoice.rimeVoiceId);
      } else {
        setNavVoicePlaying(true);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setToast(message || 'Could not play preview.');
    } finally {
      setLoadingPreviewKey((current) => (current === cacheKey ? null : current));
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
                disabled={!selectedVoiceId || selectedVoicePreviewLoading}
                onClick={() => void playVoicePreview()}
              >
                {selectedVoicePreviewLoading ? (
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
                  <CustomSelect
                    buttonClassName="mt-1 h-8 rounded-md px-2.5 py-1.5 text-xs focus-visible:ring-1"
                    value={primaryAttachedId}
                    ariaLabel="Assign phone number"
                    disabled={saveBusy === 'phone'}
                    loading={saveBusy === 'phone'}
                    options={[
                      { value: '', label: 'None (unassigned)' },
                      ...phones.map((p) => ({
                        value: p.id,
                        label: p.number,
                        description:
                          p.agent && !p.agent.deletedAt
                            ? `Assigned to ${p.agent.name}`
                            : undefined,
                      })),
                    ]}
                    onValueChange={(value) => {
                      void onPhoneRoutingChange(value);
                      setPhoneDropdownOpen(false);
                    }}
                  />
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
      <audio
        ref={previewAudioRef}
        className="hidden"
        preload="none"
        onEnded={() => {
          setPlayingVoiceId(null);
          setNavVoicePlaying(false);
        }}
        onPause={() => {
          setPlayingVoiceId(null);
          setNavVoicePlaying(false);
        }}
      />

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
          <DialogContent className="flex h-[min(82vh,720px)] w-[min(760px,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-border/80 p-0 shadow-2xl sm:max-w-none">
            <DialogHeader className="shrink-0 border-b border-border/40 px-6 pb-4 pt-5 sm:px-7">
              <DialogTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                <Sparkles className="size-4 text-amber-500" />
                Blueprint: {selectedBlueprint.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1.5">
                {selectedBlueprint.description}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-hidden px-6 py-5 sm:px-7">
              <div className="flex h-full min-h-0 flex-col gap-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Prompt Template</p>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-border/40 bg-muted/[0.04] p-5 pr-4">
                  <pre className="whitespace-pre-wrap text-[13px] leading-[1.8] text-foreground font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
                    {selectedBlueprint.template}
                  </pre>
                </div>
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-border/40 bg-muted/[0.02] px-6 py-5 sm:px-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 w-full rounded-xl border-border/60 bg-background/80 px-5 text-sm font-medium text-foreground shadow-none hover:bg-muted/60 sm:w-auto sm:min-w-[112px]"
                onClick={() => setSelectedBlueprint(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-10 w-full rounded-xl px-5 text-sm font-medium shadow-none sm:w-auto sm:min-w-[140px] bg-foreground text-background hover:bg-foreground/90"
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

      {/* ═══════════════ VOICE SELECTOR MODAL ═══════════════ */}
      <Dialog
        open={voiceModalOpen}
        onOpenChange={(next) => {
          if (!next) {
            setVoiceModalOpen(false);
            setVoiceSearchQuery('');
          }
        }}
      >
        <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-border/60 bg-background p-0 shadow-2xl sm:h-[86vh] sm:max-h-[86vh] sm:w-[90vw] sm:max-w-[1400px]">

          {/* ── Modal Header ── */}
          <div className="shrink-0 border-b border-border/40 bg-background px-5 pb-5 pt-5 sm:px-8">
            <DialogHeader className="gap-0.5">
              <DialogTitle className="text-lg font-semibold tracking-tight sm:text-xl">Select Agent Voice</DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground">
                Browse providers, preview samples, and choose the voice for your assistant.
              </DialogDescription>
            </DialogHeader>

            {/* Provider pills — horizontal scroll on mobile, flex-wrap on desktop */}
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Provider
                </p>
                <p className="text-[11px] font-medium text-muted-foreground">
                  {voiceProviderLabel(selectedVoiceProvider)} · {voiceProviderCounts[selectedVoiceProvider] ?? 0} voices
                </p>
              </div>
              <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 scrollbar-none sm:flex-wrap sm:overflow-visible" role="tablist" aria-label="Voice provider">
                {VOICE_PROVIDERS.map((provider) => {
                  const isActive = selectedVoiceProvider === provider.id;
                  const providerCount = voiceProviderCounts[provider.id];
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={cn(
                        'group relative flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring sm:shrink',
                        isActive
                          ? 'border-foreground/20 bg-foreground/[0.05] shadow-sm'
                          : 'border-border/50 bg-background hover:border-foreground/15 hover:bg-muted/30',
                      )}
                      onClick={() => {
                        setSelectedVoiceProvider(provider.id);
                        setVoiceGenderFilter('all');
                        setVoiceAccentFilter('all');
                        setVoiceTypeFilter('all');
                      }}
                    >
                      <VoiceProviderLogo providerId={provider.id} active={isActive} />
                      <div className="min-w-0">
                        <span className="block text-[13px] font-semibold text-foreground">{provider.label}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {providerCount > 0 ? `${providerCount} voices` : 'Coming soon'}
                        </span>
                      </div>
                      {isActive && (
                        <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-foreground text-background shadow-sm">
                          <Check className="size-2.5" aria-hidden />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Body: Voice List + Selected Panel ── */}
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">

            {/* Left: Voice Library */}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Search + Filters */}
              <div className="shrink-0 border-b border-border/30 bg-background px-5 py-3.5 sm:px-8">
                <div className="flex items-center gap-3">
                  <label className="relative flex-1">
                    <span className="sr-only">Search voices</span>
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      type="text"
                      placeholder="Search voices…"
                      className="h-10 w-full rounded-lg border border-input bg-muted/20 pl-10 pr-4 text-sm outline-none transition placeholder:text-muted-foreground/50 focus-visible:border-foreground/20 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                      value={voiceSearchQuery}
                      onChange={(e) => setVoiceSearchQuery(e.target.value)}
                    />
                  </label>
                  <div className="hidden items-center gap-2 sm:flex">
                    <VoiceFilterSelect
                      label="Gender"
                      value={voiceGenderFilter}
                      options={voiceGenderOptions}
                      onChange={setVoiceGenderFilter}
                    />
                    <VoiceFilterSelect
                      label="Accent"
                      value={voiceAccentFilter}
                      options={voiceAccentOptions}
                      onChange={setVoiceAccentFilter}
                    />
                    <VoiceFilterSelect
                      label="Type"
                      value={voiceTypeFilter}
                      options={voiceTypeOptions}
                      onChange={setVoiceTypeFilter}
                    />
                  </div>
                </div>
                {/* Mobile-only filter row */}
                <div className="mt-2.5 grid grid-cols-3 gap-2 sm:hidden">
                  <VoiceFilterSelect
                    label="Gender"
                    value={voiceGenderFilter}
                    options={voiceGenderOptions}
                    onChange={setVoiceGenderFilter}
                  />
                  <VoiceFilterSelect
                    label="Accent"
                    value={voiceAccentFilter}
                    options={voiceAccentOptions}
                    onChange={setVoiceAccentFilter}
                  />
                  <VoiceFilterSelect
                    label="Type"
                    value={voiceTypeFilter}
                    options={voiceTypeOptions}
                    onChange={setVoiceTypeFilter}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground/70">
                  Showing {filteredVoices.length} of {providerVoices.length} voices
                </p>
              </div>

              {/* Voice list */}
              <div ref={voiceListRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-8">
                <div className="flex flex-col gap-2">
                  {filteredVoices.map((v) => {
                    const isTempSelected = tempSelectedVoiceId === v.rimeVoiceId;
                    const isPlaying = playingVoiceId === v.rimeVoiceId;
                    const previewKey = voicePreviewCacheKey(v);
                    const isLoadingPreview = loadingPreviewKey === previewKey;
                    return (
                      <div
                        key={v.id}
                        ref={(node) => {
                          if (node) {
                            voiceRowRefs.current.set(v.rimeVoiceId, node);
                          } else {
                            voiceRowRefs.current.delete(v.rimeVoiceId);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'group relative flex cursor-pointer items-center gap-4 rounded-xl border p-3.5 outline-none transition-all duration-200 [contain-intrinsic-size:72px] [content-visibility:auto] focus-visible:ring-2 focus-visible:ring-ring',
                          isTempSelected
                            ? 'border-foreground/25 bg-foreground/[0.03] shadow-sm ring-1 ring-foreground/[0.08]'
                            : 'border-border/50 bg-background hover:border-foreground/15 hover:bg-muted/20 hover:shadow-sm',
                        )}
                        onClick={() => setTempSelectedVoiceId(v.rimeVoiceId)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setTempSelectedVoiceId(v.rimeVoiceId);
                          }
                        }}
                      >
                        {/* Avatar */}
                        <VoiceAvatar voice={v} fallback={v.name} />

                        {/* Name + meta */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{v.name}</p>
                            {isTempSelected && (
                              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                                <Check className="size-3" aria-hidden />
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{voiceTraitText(v)}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <VoiceMetaPill>{voiceGenderLabel(v)}</VoiceMetaPill>
                            <VoiceMetaPill>{voiceAccentLabel(v)}</VoiceMetaPill>
                            <VoiceMetaPill>{voiceTypeLabel(v)}</VoiceMetaPill>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={isPlaying ? 'default' : 'ghost'}
                            className="h-9 w-9 rounded-full p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              void playVoicePreview(v);
                            }}
                            disabled={isLoadingPreview}
                            title={`Preview ${v.name}`}
                          >
                            {isLoadingPreview ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : isPlaying ? (
                              <VoiceWaveform />
                            ) : (
                              <Play className="size-3.5 fill-current" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={isTempSelected ? 'default' : 'outline'}
                            className={cn(
                              'hidden h-8 rounded-full px-3 text-[11px] font-medium sm:inline-flex',
                              isTempSelected && 'gap-1.5',
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTempSelectedVoiceId(v.rimeVoiceId);
                            }}
                          >
                            {isTempSelected && <Check className="size-3" aria-hidden />}
                            {isTempSelected ? 'Selected' : 'Select'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {filteredVoices.length === 0 && (
                    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/10 px-6 py-12 text-center">
                      <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border/50 bg-background">
                        <Search className="size-5 text-muted-foreground/60" aria-hidden />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-foreground">
                        No voices found
                      </p>
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                        No {voiceProviderLabel(selectedVoiceProvider)} voices match your current filters. Try a different search term or adjust filters.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Right: Selected voice detail */}
            <aside className="hidden w-[320px] shrink-0 border-l border-border/30 bg-muted/[0.02] lg:flex lg:flex-col">
              <div className="flex-1 overflow-y-auto overscroll-contain p-5">
                <div className="rounded-2xl border border-border/50 bg-background p-5 shadow-lg shadow-foreground/[0.03]">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Selected Voice
                  </p>

                  {selectedPanelVoice ? (
                    <div className="mt-4">
                      <div className="flex flex-col items-center text-center">
                        <div className="relative">
                          <VoiceAvatar voice={selectedPanelVoice} fallback={selectedPanelVoice.name} size="lg" />
                          <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-foreground text-background">
                            <Check className="size-2.5" aria-hidden />
                          </span>
                        </div>
                        <p className="mt-3 max-w-full truncate text-lg font-semibold tracking-tight text-foreground">
                          {selectedPanelVoice.name}
                        </p>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">
                          {selectedPanelProviderLabel}
                        </p>
                      </div>

                      <div className="mt-4 space-y-1.5">
                        <VoicePanelField label="Gender" value={voiceGenderLabel(selectedPanelVoice)} />
                        <VoicePanelField label="Accent" value={voiceAccentLabel(selectedPanelVoice)} />
                        <VoicePanelField label="Type" value={voiceTypeLabel(selectedPanelVoice)} />
                      </div>

                      <Button
                        type="button"
                        className="mt-4 h-10 w-full gap-2 rounded-full text-[13px] font-medium"
                        variant={selectedPanelPlaying ? 'default' : 'outline'}
                        onClick={() => void playVoicePreview(selectedPanelVoice)}
                        disabled={selectedPanelPreviewLoading}
                      >
                        {selectedPanelPreviewLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : selectedPanelPlaying ? (
                          <VoiceWaveform />
                        ) : (
                          <Play className="size-4 fill-current" />
                        )}
                        <span>
                          {selectedPanelPreviewLoading
                            ? 'Loading…'
                            : selectedPanelPlaying
                              ? 'Playing…'
                              : 'Preview Voice'}
                        </span>
                      </Button>

                      <div className="mt-4 rounded-lg border border-border/40 bg-muted/15 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                          Voice ID
                        </p>
                        <p className="mt-0.5 break-all text-[12px] font-mono text-foreground/80">
                          {selectedPanelVoice.rimeVoiceId}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 flex flex-col items-center py-6 text-center">
                      <div className="flex size-14 items-center justify-center rounded-full border border-dashed border-border/60 bg-muted/15">
                        <Volume2 className="size-5 text-muted-foreground/50" aria-hidden />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-foreground">No voice selected</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Click a voice from the library to preview details here.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>

          {/* ── Footer ── */}
          <div className="shrink-0 border-t border-border/40 bg-background px-5 py-3 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                {selectedPanelVoice ? (
                  <div className="flex items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                      <Check className="size-3 text-foreground" aria-hidden />
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">{selectedPanelVoice.name}</span>
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">·</span>
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">{selectedPanelProviderLabel}</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">No voice selected</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 px-4 text-[13px] font-medium"
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
                  className="h-9 rounded-lg px-5 text-[13px] font-semibold shadow-sm"
                  disabled={!tempSelectedVoiceId || voiceSaveBusy}
                  onClick={() => {
                    void onVoiceSelect(tempSelectedVoiceId);
                  }}
                >
                  {voiceSaveBusy ? 'Saving…' : 'Confirm Voice'}
                </Button>
              </div>
            </div>
          </div>
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
      <CustomSelect
        className="mt-1"
        buttonClassName="h-9 cursor-not-allowed border-border/50 bg-background/70 px-2.5 text-xs font-medium disabled:opacity-100"
        value={value}
        ariaLabel={`${label} provider`}
        disabled
        options={options.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
      />
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

function voicePreviewText(voice: VoiceDto): string {
  const name = cleanVoicePreviewName(voice.name);
  if (!name) {
    return VOICE_PREVIEW_FALLBACK_TEXT;
  }
  return `Hi, this is ${name}. I am Awaaz’s voice agent.`;
}

function voicePreviewCacheKey(voice: VoiceDto): string {
  return [
    voice.rimeVoiceId,
    voice.modelId ?? 'default-model',
    voice.lang ?? 'default-lang',
    voicePreviewText(voice),
  ].join('|');
}

function cleanVoicePreviewName(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface VoiceFilterOption {
  value: string;
  label: string;
}

function VoiceFilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: VoiceFilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full min-w-[90px] rounded-lg border border-input bg-background px-2.5 text-xs font-medium outline-none transition hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="all">{label}: All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function VoiceProviderLogo({
  providerId,
  active,
}: {
  providerId: VoiceProviderId;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        'flex size-9 items-center justify-center rounded-xl border text-xs font-bold shadow-sm transition-colors',
        active
          ? 'border-foreground/15 bg-foreground text-background'
          : 'border-border/70 bg-muted/35 text-foreground group-hover:bg-background',
      )}
      aria-hidden
    >
      {voiceProviderInitials(providerId)}
    </span>
  );
}

function VoiceAvatar({
  voice,
  fallback,
  size = 'md',
}: {
  voice?: VoiceDto | null;
  fallback: string;
  size?: 'md' | 'lg';
}) {
  const label = voice?.name ?? fallback;
  const src = voiceAvatarSrc(voice, fallback);
  const imageSize = size === 'lg' ? 80 : 52;
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-full border border-border/70 bg-muted shadow-sm',
        size === 'lg' ? 'size-20' : 'size-[52px]',
      )}
    >
      <Image
        src={src}
        alt={`${label} avatar`}
        width={imageSize}
        height={imageSize}
        className="size-full object-cover"
        draggable={false}
      />
    </div>
  );
}

function VoicePanelField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/15 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </span>
      <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function VoiceWaveform() {
  return (
    <span className="flex h-4 w-4 items-center justify-center gap-[2px]" aria-hidden>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes awaaz-voice-wave {
              0%, 100% { height: 4px; }
              50% { height: 14px; }
            }
            .awaaz-voice-wave-1 { animation: awaaz-voice-wave 0.72s ease-in-out infinite; }
            .awaaz-voice-wave-2 { animation: awaaz-voice-wave 0.72s ease-in-out 0.12s infinite; }
            .awaaz-voice-wave-3 { animation: awaaz-voice-wave 0.72s ease-in-out 0.24s infinite; }
          `,
        }}
      />
      <span className="awaaz-voice-wave-1 w-[2px] rounded-full bg-current" />
      <span className="awaaz-voice-wave-2 w-[2px] rounded-full bg-current" />
      <span className="awaaz-voice-wave-3 w-[2px] rounded-full bg-current" />
    </span>
  );
}

function VoiceMetaPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/40 bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function voiceProviderId(voice?: VoiceDto | null): VoiceProviderId {
  const provider = normalizeVoiceFilterValue(voice?.provider ?? '');
  if (provider) {
    const match = VOICE_PROVIDERS.find((item) => item.id === provider);
    if (match) {
      return match.id;
    }
  }
  return 'rime';
}

function voiceProviderLabel(providerId: VoiceProviderId): string {
  return (
    VOICE_PROVIDERS.find((provider) => provider.id === providerId)?.label ??
    'Rime'
  );
}

function voiceProviderInitials(providerId: VoiceProviderId): string {
  switch (providerId) {
    case 'elevenlabs':
      return 'EL';
    case 'openai':
      return 'AI';
    case 'cartesia':
      return 'CA';
    case 'fish-audio':
      return 'FA';
    case 'future':
      return '+';
    case 'rime':
    default:
      return 'RI';
  }
}

function voiceGenderLabel(voice: VoiceDto): string {
  return humanizeVoiceToken(voice.gender) || 'Any gender';
}

function voiceAccentLabel(voice: VoiceDto): string {
  return (
    languageLabel(voice.language) ||
    languageLabel(voice.lang) ||
    'English'
  );
}

function voiceTypeLabel(voice: VoiceDto): string {
  return humanizeVoiceToken(voice.modelId) || 'Default';
}

function voiceTraitText(voice: VoiceDto): string {
  return (
    voice.description?.trim() ||
    `${voiceAccentLabel(voice)} ${voiceTypeLabel(voice)} voice.`
  );
}

function voiceMatchesFilters(
  voice: VoiceDto,
  searchQuery: string,
  genderFilter: string,
  accentFilter: string,
  typeFilter: string,
): boolean {
  const search = searchQuery.trim().toLowerCase();
  const searchHaystack = [
    voice.name,
    voice.rimeVoiceId,
    voice.description,
    voiceGenderLabel(voice),
    voiceAccentLabel(voice),
    voiceTypeLabel(voice),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    (!search || searchHaystack.includes(search)) &&
    (genderFilter === 'all' ||
      normalizeVoiceFilterValue(voiceGenderLabel(voice)) === genderFilter) &&
    (accentFilter === 'all' ||
      normalizeVoiceFilterValue(voiceAccentLabel(voice)) === accentFilter) &&
    (typeFilter === 'all' ||
      normalizeVoiceFilterValue(voiceTypeLabel(voice)) === typeFilter)
  );
}

function uniqueVoiceFilterOptions(labels: string[]): VoiceFilterOption[] {
  const byValue = new Map<string, string>();
  for (const label of labels) {
    const cleanLabel = label.trim();
    const value = normalizeVoiceFilterValue(cleanLabel);
    if (cleanLabel && !byValue.has(value)) {
      byValue.set(value, cleanLabel);
    }
  }

  return [...byValue.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));
}

function normalizeVoiceFilterValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function languageLabel(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) {
    return '';
  }

  const normalized = raw.toLowerCase();
  const labels: Record<string, string> = {
    en: 'English',
    eng: 'English',
    es: 'Spanish',
    spa: 'Spanish',
    fr: 'French',
    fra: 'French',
    de: 'German',
    ger: 'German',
    ar: 'Arabic',
    ara: 'Arabic',
    he: 'Hebrew',
    heb: 'Hebrew',
    hi: 'Hindi',
    hin: 'Hindi',
    ja: 'Japanese',
    jpn: 'Japanese',
    pt: 'Portuguese',
    por: 'Portuguese',
  };
  return labels[normalized] ?? humanizeVoiceToken(raw);
}

function humanizeVoiceToken(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) {
    return '';
  }
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function voiceAvatarSrc(
  voice: VoiceDto | null | undefined,
  fallback: string,
): string {
  const folder = voiceAvatarFolder(voice);
  const count = VOICE_AVATAR_COUNTS[folder];
  const key = voice?.rimeVoiceId || voice?.name || fallback || 'voice';
  const index = (stableAvatarHash(key) % count) + 1;
  return `/voices-avatars/${folder}/${String(index).padStart(2, '0')}.png`;
}

function voiceAvatarFolder(
  voice: VoiceDto | null | undefined,
): VoiceAvatarFolder {
  const gender = normalizeVoiceFilterValue(voice?.gender ?? '');
  if (
    gender === 'female' ||
    gender.includes('female') ||
    gender.includes('woman') ||
    gender.includes('feminine')
  ) {
    return 'female';
  }
  if (
    gender === 'male' ||
    gender.includes(' male') ||
    gender.startsWith('male') ||
    gender.includes('man') ||
    gender.includes('masculine')
  ) {
    return 'male';
  }
  return 'neutral';
}

function stableAvatarHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function storedVoicePreviewUrl(voice: VoiceDto): string | null {
  const url = voice.previewPlaybackUrl?.trim();
  return url ? url : null;
}

async function fetchStoredVoicePreviewObjectUrl(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) {
    throw new Error(`Stored preview audio failed with ${res.status}.`);
  }

  const audioBlob = await res.blob();
  if (audioBlob.size === 0) {
    throw new Error('Stored preview audio was empty.');
  }
  return URL.createObjectURL(audioBlob);
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
