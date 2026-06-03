'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';

import { useUser } from '@clerk/nextjs';
import { usePathname, useRouter } from 'next/navigation';
import useLocalStorageState from 'use-local-storage-state';
import { useState } from 'react';

import { useOrgContext } from '@/components/org-context';

export type OnboardingStepId =
  | 'welcome'
  | 'organization'
  | 'agent'
  | 'agentBlueprints'
  | 'agentPrompt'
  | 'saveVersion'
  | 'apiKeysMode'
  | 'apiKeys'
  | 'publishVersion'
  | 'testCall';

export type OnboardingStatus =
  | 'idle'
  | 'active'
  | 'dismissed'
  | 'completed';

interface OnboardingStepState {
  organizationCreated: boolean;
  agentCreated: boolean;
  blueprintsViewed: boolean;
  promptDrafted: boolean;
  promptConfigured: boolean;
  apiKeysModeViewed: boolean;
  apiKeysConfigured: boolean;
  versionPublished: boolean;
  testCallCompleted: boolean;
}

interface StoredOnboardingState {
  version: 2;
  status: OnboardingStatus;
  checklistCollapsed: boolean;
  startedAt?: string;
  dismissedAt?: string;
  completedAt?: string;
  steps: OnboardingStepState;
}

export interface OnboardingStepDefinition {
  id: OnboardingStepId;
  title: string;
  description: string;
  target?: string;
  completed: boolean;
}

interface OnboardingContextValue {
  status: OnboardingStatus;
  isEligible: boolean;
  isActive: boolean;
  checklistCollapsed: boolean;
  progress: number;
  steps: OnboardingStepDefinition[];
  currentStep: OnboardingStepDefinition | null;
  start: () => void;
  dismiss: () => void;
  setChecklistCollapsed: (collapsed: boolean) => void;
  markAgentCreated: () => void;
  markTestCallCompleted: () => void;
  runCurrentStepAction: () => void;
}

const DEFAULT_STATE: StoredOnboardingState = {
  version: 2,
  status: 'idle',
  checklistCollapsed: false,
  steps: {
    organizationCreated: false,
    agentCreated: false,
    blueprintsViewed: false,
    promptDrafted: false,
    promptConfigured: false,
    apiKeysModeViewed: false,
    apiKeysConfigured: false,
    versionPublished: false,
    testCallCompleted: false,
  },
};

const ONBOARDING_EVENT_AGENT_CREATED = 'awaaz:onboarding:agent-created';
const ONBOARDING_EVENT_BLUEPRINTS_VIEWED = 'awaaz:onboarding:blueprints-viewed';
const ONBOARDING_EVENT_PROMPT_DRAFTED = 'awaaz:onboarding:prompt-drafted';
const ONBOARDING_EVENT_PROMPT_CONFIGURED = 'awaaz:onboarding:prompt-configured';
const ONBOARDING_EVENT_API_KEYS_MODE_VIEWED = 'awaaz:onboarding:api-keys-mode-clicked';
const ONBOARDING_EVENT_API_KEYS_CONFIGURED = 'awaaz:onboarding:api-keys-configured';
const ONBOARDING_EVENT_VERSION_PUBLISHED = 'awaaz:onboarding:version-published';
const ONBOARDING_EVENT_TEST_COMPLETED =
  'awaaz:onboarding:test-interaction-completed';
const ONBOARDING_EVENT_AGENTS_LOADED = 'awaaz:onboarding:agents-loaded';

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { orgs, loadingOrgs } = useOrgContext();
  const storageKey = user?.id
    ? `awaaz:onboarding:v2:${user.id}`
    : 'awaaz:onboarding:v2:anonymous';
  const [state, setState] = useLocalStorageState<StoredOnboardingState>(
    storageKey,
    { defaultValue: DEFAULT_STATE },
  );
  const [firstAgentId, setFirstAgentId] = useState<string | null>(null);

  const normalizedState = normalizeState(state);
  const organizationCreated =
    normalizedState.steps.organizationCreated || orgs.length > 0;
  const steps = useMemo<OnboardingStepDefinition[]>(
    () => [
      {
        id: 'welcome',
        title: 'Start your Awaaz workspace',
        description:
          'Set up the essentials once, then move straight into building and testing your first voice agent.',
        completed: normalizedState.status !== 'idle',
      },
      {
        id: 'organization',
        title: 'Create your organization',
        description:
          'Your organization keeps agents, calls, numbers, billing, and teammates scoped cleanly.',
        target: 'create-organization',
        completed: organizationCreated,
      },
      {
        id: 'agent',
        title: 'Create your first agent',
        description:
          'Give the agent a name and a short description. You can tune instructions and voice after creation.',
        target: 'create-agent',
        completed: normalizedState.steps.agentCreated,
      },
      {
        id: 'agentPrompt',
        title: 'Write a prompt or choose a blueprint',
        description:
          'Type the agent instructions, or open Blueprints and apply one as a starting point.',
        target: 'agent-prompt',
        completed:
          normalizedState.steps.promptDrafted ||
          normalizedState.steps.promptConfigured,
      },
      {
        id: 'saveVersion',
        title: 'Save the prompt version',
        description:
          'Use Update or Save V to store the prompt. Publishing live comes next.',
        target: 'save-version',
        completed: normalizedState.steps.promptConfigured,
      },
      {
        id: 'apiKeys',
        title: 'Configure Voice Pipeline',
        description:
          'Set up your Voice Pipeline keys (STT, LLM, TTS) and save runtime settings.',
        target: 'api-keys',
        completed: normalizedState.steps.apiKeysConfigured,
      },
      {
        id: 'publishVersion',
        title: 'Publish Live',
        description:
          'Publish your agent version to make it live for testing.',
        target: 'publish-version',
        completed: normalizedState.steps.versionPublished,
      },
      {
        id: 'testCall',
        title: 'Run a browser test call',
        description:
          'Open the agent preview and complete the first successful voice interaction.',
        target: 'test-agent',
        completed: normalizedState.steps.testCallCompleted,
      },
    ],
    [
      normalizedState.status,
      normalizedState.steps.agentCreated,
      normalizedState.steps.promptDrafted,
      normalizedState.steps.promptConfigured,
      normalizedState.steps.apiKeysConfigured,
      normalizedState.steps.versionPublished,
      normalizedState.steps.testCallCompleted,
      organizationCreated,
    ],
  );

  const completedStepCount = steps.filter((step) => step.completed).length;
  const progress = Math.round((completedStepCount / steps.length) * 100);
  const isEligible =
    userLoaded &&
    Boolean(user?.id) &&
    !loadingOrgs &&
    orgs.length === 0 &&
    normalizedState.status === 'idle';
  const isActive = normalizedState.status === 'active';
  const currentStep =
    normalizedState.status === 'active'
      ? steps.find((step) => !step.completed) ?? null
      : null;

  const patchState = useCallback(
    (updater: (current: StoredOnboardingState) => StoredOnboardingState) => {
      setState((current) => updater(normalizeState(current)));
    },
    [setState],
  );

  const start = useCallback(() => {
    patchState((current) => ({
      ...current,
      status: 'active',
      startedAt: current.startedAt ?? new Date().toISOString(),
      dismissedAt: undefined,
      completedAt: undefined,
      checklistCollapsed: false,
    }));
  }, [patchState]);

  const dismiss = useCallback(() => {
    patchState((current) => ({
      ...current,
      status: 'dismissed',
      dismissedAt: new Date().toISOString(),
      checklistCollapsed: false,
    }));
  }, [patchState]);

  const setChecklistCollapsed = useCallback(
    (collapsed: boolean) => {
      patchState((current) => ({
        ...current,
        checklistCollapsed: collapsed,
      }));
    },
    [patchState],
  );

  const markOrganizationCreated = useCallback(() => {
    patchState((current) => {
      if (current.steps.organizationCreated) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          organizationCreated: true,
        },
      };
    });
  }, [patchState]);

  const markAgentCreated = useCallback(() => {
    patchState((current) => {
      if (current.steps.agentCreated) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          agentCreated: true,
        },
      };
    });
  }, [patchState]);

  const markBlueprintsViewed = useCallback(() => {
    patchState((current) => {
      if (current.steps.blueprintsViewed) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          blueprintsViewed: true,
        },
      };
    });
  }, [patchState]);

  const markPromptDrafted = useCallback(() => {
    patchState((current) => {
      if (current.steps.promptDrafted) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          promptDrafted: true,
        },
      };
    });
  }, [patchState]);

  const markPromptConfigured = useCallback(() => {
    patchState((current) => {
      if (current.steps.promptConfigured) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          promptConfigured: true,
        },
      };
    });
  }, [patchState]);

  const markApiKeysModeViewed = useCallback(() => {
    patchState((current) => {
      if (current.steps.apiKeysModeViewed) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          apiKeysModeViewed: true,
        },
      };
    });
  }, [patchState]);

  const markApiKeysConfigured = useCallback(() => {
    patchState((current) => {
      if (current.steps.apiKeysConfigured) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          apiKeysConfigured: true,
        },
      };
    });
  }, [patchState]);

  const markVersionPublished = useCallback(() => {
    patchState((current) => {
      if (current.steps.versionPublished) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          versionPublished: true,
        },
      };
    });
  }, [patchState]);

  const markTestCallCompleted = useCallback(() => {
    patchState((current) => {
      if (current.steps.testCallCompleted) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          testCallCompleted: true,
        },
      };
    });
  }, [patchState]);

  const runCurrentStepAction = useCallback(() => {
    if (!currentStep) {
      return;
    }
    const target = currentStep.target
      ? findVisibleOnboardingTarget(currentStep.target)
      : null;
    if (target instanceof HTMLElement) {
      if (['testCall', 'agentPrompt', 'saveVersion', 'apiKeys', 'publishVersion', 'agentBlueprints'].includes(currentStep.id)) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (!target.hasAttribute('disabled')) {
        target.focus({ preventScroll: true });
        target.click();
      }
      return;
    }
    if (['testCall', 'agentPrompt', 'saveVersion', 'apiKeys', 'publishVersion', 'agentBlueprints'].includes(currentStep.id)) {
      if (pathname.startsWith('/agents/') && pathname !== '/agents/new') {
        // Already on an agent page, target just might be hidden or scrolling.
      } else if (firstAgentId) {
        router.push(`/agents/${firstAgentId}`);
      } else {
        router.push('/agents');
      }
    } else if (pathname !== '/agents') {
      router.push('/agents');
    }
  }, [currentStep, pathname, router, firstAgentId]);

  useEffect(() => {
    if (normalizedState.status !== 'active' || loadingOrgs || orgs.length === 0) {
      return;
    }
    markOrganizationCreated();
  }, [
    loadingOrgs,
    markOrganizationCreated,
    normalizedState.status,
    orgs.length,
  ]);

  useEffect(() => {
    const onAgentCreated = () => markAgentCreated();
    const onBlueprintsViewed = () => markBlueprintsViewed();
    const onPromptDrafted = () => markPromptDrafted();
    const onPromptConfigured = () => markPromptConfigured();
    const onApiKeysModeViewed = () => markApiKeysModeViewed();
    const onApiKeysConfigured = () => markApiKeysConfigured();
    const onVersionPublished = () => markVersionPublished();
    const onTestCompleted = () => markTestCallCompleted();
    const onAgentsLoaded = (e: Event) => {
      const customEvent = e as CustomEvent<{ firstAgentId: string | null }>;
      const loadedFirstAgentId = customEvent.detail?.firstAgentId ?? null;
      setFirstAgentId(loadedFirstAgentId);
      if (loadedFirstAgentId) {
        markAgentCreated();
      }
    };
    
    window.addEventListener(ONBOARDING_EVENT_AGENT_CREATED, onAgentCreated);
    window.addEventListener(ONBOARDING_EVENT_BLUEPRINTS_VIEWED, onBlueprintsViewed);
    window.addEventListener(ONBOARDING_EVENT_PROMPT_DRAFTED, onPromptDrafted);
    window.addEventListener(ONBOARDING_EVENT_PROMPT_CONFIGURED, onPromptConfigured);
    window.addEventListener(ONBOARDING_EVENT_API_KEYS_MODE_VIEWED, onApiKeysModeViewed);
    window.addEventListener(ONBOARDING_EVENT_API_KEYS_CONFIGURED, onApiKeysConfigured);
    window.addEventListener(ONBOARDING_EVENT_VERSION_PUBLISHED, onVersionPublished);
    window.addEventListener(
      ONBOARDING_EVENT_TEST_COMPLETED,
      onTestCompleted,
    );
    window.addEventListener(ONBOARDING_EVENT_AGENTS_LOADED, onAgentsLoaded);
    
    return () => {
      window.removeEventListener(ONBOARDING_EVENT_AGENT_CREATED, onAgentCreated);
      window.removeEventListener(ONBOARDING_EVENT_BLUEPRINTS_VIEWED, onBlueprintsViewed);
      window.removeEventListener(ONBOARDING_EVENT_PROMPT_DRAFTED, onPromptDrafted);
      window.removeEventListener(ONBOARDING_EVENT_PROMPT_CONFIGURED, onPromptConfigured);
      window.removeEventListener(ONBOARDING_EVENT_API_KEYS_MODE_VIEWED, onApiKeysModeViewed);
      window.removeEventListener(ONBOARDING_EVENT_API_KEYS_CONFIGURED, onApiKeysConfigured);
      window.removeEventListener(ONBOARDING_EVENT_VERSION_PUBLISHED, onVersionPublished);
      window.removeEventListener(
        ONBOARDING_EVENT_TEST_COMPLETED,
        onTestCompleted,
      );
      window.removeEventListener(ONBOARDING_EVENT_AGENTS_LOADED, onAgentsLoaded);
    };
  }, [markAgentCreated, markBlueprintsViewed, markPromptDrafted, markPromptConfigured, markApiKeysModeViewed, markApiKeysConfigured, markVersionPublished, markTestCallCompleted]);

  useEffect(() => {
    if (normalizedState.status !== 'active') {
      return undefined;
    }
    const allComplete =
      organizationCreated &&
      normalizedState.steps.agentCreated &&
      normalizedState.steps.promptConfigured &&
      normalizedState.steps.apiKeysConfigured &&
      normalizedState.steps.versionPublished &&
      normalizedState.steps.testCallCompleted;
    if (!allComplete) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      patchState((current) => ({
        ...current,
        status: 'completed',
        completedAt: current.completedAt ?? new Date().toISOString(),
        checklistCollapsed: false,
      }));
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [
    normalizedState.status,
    normalizedState.steps.agentCreated,
    normalizedState.steps.promptConfigured,
    normalizedState.steps.apiKeysConfigured,
    normalizedState.steps.versionPublished,
    normalizedState.steps.testCallCompleted,
    organizationCreated,
    patchState,
  ]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      status: normalizedState.status,
      isEligible,
      isActive,
      checklistCollapsed: normalizedState.checklistCollapsed,
      progress,
      steps,
      currentStep,
      start,
      dismiss,
      setChecklistCollapsed,
      markAgentCreated,
      markTestCallCompleted,
      runCurrentStepAction,
    }),
    [
      currentStep,
      dismiss,
      isActive,
      isEligible,
      markAgentCreated,
      markTestCallCompleted,
      normalizedState.checklistCollapsed,
      normalizedState.status,
      progress,
      runCurrentStepAction,
      setChecklistCollapsed,
      start,
      steps,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}

export function dispatchOnboardingAgentCreated() {
  window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT_AGENT_CREATED));
}

export function dispatchOnboardingTestInteractionCompleted() {
  window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT_TEST_COMPLETED));
}

export function dispatchOnboardingAgentsLoaded(firstAgentId: string | null) {
  window.dispatchEvent(
    new CustomEvent(ONBOARDING_EVENT_AGENTS_LOADED, {
      detail: { firstAgentId },
    })
  );
}

function normalizeState(
  value: StoredOnboardingState | undefined,
): StoredOnboardingState {
  if (!value || value.version !== 2) {
    return DEFAULT_STATE;
  }
  return {
    version: 2,
    status: value.status ?? 'idle',
    checklistCollapsed: Boolean(value.checklistCollapsed),
    startedAt: value.startedAt,
    dismissedAt: value.dismissedAt,
    completedAt: value.completedAt,
    steps: {
      organizationCreated: Boolean(value.steps?.organizationCreated),
      agentCreated: Boolean(value.steps?.agentCreated),
      blueprintsViewed: Boolean(value.steps?.blueprintsViewed),
      promptDrafted: Boolean(value.steps?.promptDrafted),
      promptConfigured: Boolean(value.steps?.promptConfigured),
      apiKeysModeViewed: Boolean(value.steps?.apiKeysModeViewed),
      apiKeysConfigured: Boolean(value.steps?.apiKeysConfigured),
      versionPublished: Boolean(value.steps?.versionPublished),
      testCallCompleted: Boolean(value.steps?.testCallCompleted),
    },
  };
}

function findVisibleOnboardingTarget(target: string): Element | null {
  const elements = Array.from(
    document.querySelectorAll(`[data-onboarding-target="${target}"]`),
  );
  return (
    elements.find((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    }) ?? null
  );
}
